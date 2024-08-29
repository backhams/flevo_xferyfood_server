const express = require("express");
const router = express.Router();
// const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");
const NodeCache = require('node-cache');
const sendEmailNotication = require("../mail/newRestaurantRegisterEmailAlert")
const sendDeliveryPartnerEmailNotication = require("../mail/newDeliveryPartnerRegisterEmailAlert")
const sendCustomerEmailNotication = require("../mail/newCustomerRegisterEmailAlert")
const sendLoginEmailNotification = require('../mail/loginEmailAlert')
const jwt = require("jsonwebtoken");
const verifyTokenAndDevice = require("../middleWare/verifyTokenAndDevice");
// Create a new instance of NodeCache
const cache = new NodeCache();
// const sdk = require('node-appwrite');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const { Client, Users, Query, Databases, ID } = require('node-appwrite');

// Initialize the Appwrite client
const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Your Appwrite Endpoint
    .setProject('668f60ac000406c3071f') // Your Appwrite Project ID
    .setKey('5e0b177bd628717e22b8086d7571abc23958f1f61ef9c69c6b7c6fa136a62b4dce3c7f71072abc386ad166472d1bce32f276db3064e921035d2a48fdfca80f35169721399f0088dd11687f491ce7b835f8a8095be9951878a88ec3fb381276f6aaf4cf0639f4011d51f77e7a4d75147bdfca2e8e1b44496cbe4af6ec6ea6551b'); // Your Appwrite Secret API Key

// Initialize the Users service
const users = new Users(client);
const databases = new Databases(client);


dotenv.config({ path: "./config.env" });
// const SECRET_KEY = process.env.SECRET_KEY;

//database connection
require("../db/conn");

const {
  customer,
  deliveryPartner,
  restaurant,
  menu,
  order,
  bugReport,
  feedback,
  linkRequest
} = require("../model/userSchema");



async function agentJoint(agentEmail, agentName, customerEmail, customerName) {
  try {
     // Ensure your IDs are correctly set
     const DATABASE_ID = '668f67c400151ab278a7';
     const COLLECTION_ID = '669001c500315a53a220';
      // Create the first message: notifying the customer that the agent has joined the chat
      await databases.createDocument(
        DATABASE_ID,
        COLLECTION_ID,
          ID.unique(),
          {
              agentEmail,
              agentName:"ChatBuddy",
              customerEmail,
              customerName,
              message: `${agentName} has joined the chat to assist you.`,
              senderId: agentEmail,
              createdAt: new Date().toISOString(),
              isUnread: true
          }
      );

      // Create the second message: greeting from the agent
      await databases.createDocument(
           DATABASE_ID,
            COLLECTION_ID,
          ID.unique(),
          {
              agentEmail,
              agentName,
              customerEmail,
              customerName,
              message: `Hi, I am ${agentName}. Welcome to Flevo chat support. How can I help you today?`,
              senderId: agentEmail,
              createdAt: new Date().toISOString(),
              isUnread: true
          }
      );

  } catch (error) {
      console.log('Error creating appwrite jointchat message documents:', error);
  }
}


//hello world
router.get("/",async (req,res)=>{
  res.status(200).json({message:`Hello this is from xferyfood (FleVo) ${process.pid}`})
});

// User  registration and validation register route
router.post("/register", async (req, res) => {
  const { name, email, role, deviceToken, deviceName,deviceOs} = req.body;
  const location = "not added";
  const longitude = "not set";
  const latitude = "not set";
  const status = "inactive";
  const restaurantName = "not set";
  const phoneNumber = "not set";

  if (!name || !email || !role || !deviceToken || !deviceOs) {
    return res.status(422).json("Please fill all the required fields.");
  }

  try {
    // Check if the email exists in any of the collections
    const existingCustomer = await customer.findOne({ email });
    const existingDeliveryPartner = await deliveryPartner.findOne({ email });
    const existingRestaurant = await restaurant.findOne({ email });

    // Remove the deviceToken from any existing documents in all collections
    await Promise.all([
      customer.updateMany({ 'loginDevices.deviceToken': deviceToken }, { $pull: { loginDevices: { deviceToken: deviceToken } } }),
      deliveryPartner.updateMany({ 'loginDevices.deviceToken': deviceToken }, { $pull: { loginDevices: { deviceToken: deviceToken } } }),
      restaurant.updateMany({ 'loginDevices.deviceToken': deviceToken }, { $pull: { loginDevices: { deviceToken: deviceToken } } })
    ]);

    if (existingCustomer) {
      // If email exists as a customer, return 201 if role matches
      if (role === 'customer') {
        // Add deviceToken back to the customer document
        await customer.updateOne({ email: email }, { $addToSet: { loginDevices: { deviceName, deviceToken, deviceOs } } });
        sendLoginEmailNotification(email, deviceName);
        // Generate JWT token with user's email
        const token = jwt.sign({ email }, process.env.SECRET_KEY);
        return res.status(201).json({ message: "login successfully.", token, id: existingCustomer._id });
      } else {
        return res.status(400).json("Email already in use as a customer.");
      }
    } else if (existingDeliveryPartner) {
      // If email exists as a delivery partner, return 201 if role matches
      if (role === 'deliveryPartner') {
        // Add deviceToken back to the delivery partner document
        await deliveryPartner.updateOne({ email: email }, { $addToSet: { loginDevices: { deviceName, deviceToken, deviceOs } } });
        sendLoginEmailNotification(email, deviceName);
        const token = jwt.sign({ email }, process.env.SECRET_KEY);
        return res.status(201).json({ message: "login successfully.", token, id: existingDeliveryPartner._id });
      } else {
        return res.status(400).json("Email already in use as a delivery partner.");
      }
    } else if (existingRestaurant) {
      // If email exists as a restaurant, return 201 if role matches
      if (role === 'restaurant') {
        // Add deviceToken back to the restaurant document
        await restaurant.updateOne({ email: email }, { $addToSet: { loginDevices: { deviceName, deviceToken, deviceOs } } });
        sendLoginEmailNotification(email, deviceName);
        const token = jwt.sign({ email }, process.env.SECRET_KEY);
        return res.status(201).json({ message: "login successfully.", token, id: existingRestaurant._id });
      } else {
        return res.status(400).json("Email already in use as a restaurant.");
      }
    }

    // Save the new user to the appropriate collection based on the role
    let newUser;
    switch (role) {
      case 'customer':
        newUser = new customer({ name, email });
        break;
      case 'deliveryPartner':
        newUser = new deliveryPartner({ name, email });
        break;
      case 'restaurant':
        newUser = new restaurant({ name, email, status, location, latitude, longitude, restaurantName, phoneNumber });
        break;
      default:
        return res.status(422).json("Invalid role.");
    }

    // Add the new user and return success message
    newUser.loginDevices.push({ deviceName, deviceToken,deviceOs });
    await newUser.save();

    // Generate JWT token with user's email
    const token = jwt.sign({ email }, process.env.SECRET_KEY);

    if(role ==="restaurant"){
      sendEmailNotication(email,name)
    } else if (role === "customer"){
      sendCustomerEmailNotication(email,name)
    } else if (role ==="deliveryPartner"){
      sendDeliveryPartnerEmailNotication(email,name)
    }
    // Return the document ID along with the success message and token
    res.status(201).json({ message: "User registered successfully.", token, id: newUser._id });
  } catch (err) {
    console.log(err)
    res.status(500).json("Internal server error, please try again later.");
  }
});


// logout route endpoint
router.delete('/logout', verifyTokenAndDevice, async (req, res) => {
  const { email, deviceToken, role } = req.body;

  try {
    let updatedUser;

    // Depending on the role, find and update the user document
    switch (role) {
      case 'customer':
        updatedUser = await customer.findOneAndUpdate(
          { email },
          { $pull: { loginDevices: { deviceToken } } },
          { new: true }
        );
        break;
      case 'deliveryPartner':
        updatedUser = await deliveryPartner.findOneAndUpdate(
          { email },
          { $pull: { loginDevices: { deviceToken } } },
          { new: true }
        );
        break;
      case 'restaurant':
        updatedUser = await restaurant.findOneAndUpdate(
          { email },
          { $pull: { loginDevices: { deviceToken } } },
          { new: true }
        );
        break;
      default:
        return res.status(400).json({ error: "Invalid role provided" });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// logout from all device
router.delete('/logoutAll', async (req, res) => { // Changed endpoint name to /logoutAll
  const { email, role, logoutAll, deviceTokens } = req.body;
  try {
    let updatedUser;

    switch (role) {
      case 'customer':
        if (logoutAll) {
          updatedUser = await customer.findOneAndUpdate(
            { email },
            { $set: { loginDevices: [] } },
            { new: true }
          );
        } else if (deviceTokens && deviceTokens.length > 0) {
          updatedUser = await customer.findOneAndUpdate(
            { email },
            { $pull: { loginDevices: { deviceToken: { $in: deviceTokens } } } },
            { new: true }
          );
        } else {
          return res.status(400).json({ error: "Invalid request" });
        }
        break;
      case 'deliveryPartner':
        if (logoutAll) {
          updatedUser = await deliveryPartner.findOneAndUpdate(
            { email },
            { $set: { loginDevices: [] } },
            { new: true }
          );
        } else if (deviceTokens && deviceTokens.length > 0) {
          updatedUser = await deliveryPartner.findOneAndUpdate(
            { email },
            { $pull: { loginDevices: { deviceToken: { $in: deviceTokens } } } },
            { new: true }
          );
        } else {
          return res.status(400).json({ error: "Invalid request" });
        }
        break;
      case 'restaurant':
        if (logoutAll) {
          updatedUser = await restaurant.findOneAndUpdate(
            { email },
            { $set: { loginDevices: [] } },
            { new: true }
          );
        } else if (deviceTokens && deviceTokens.length > 0) {
          updatedUser = await restaurant.findOneAndUpdate(
            { email },
            { $pull: { loginDevices: { deviceToken: { $in: deviceTokens } } } },
            { new: true }
          );
        } else {
          return res.status(400).json({ error: "Invalid request" });
        }
        break;
      default:
        return res.status(400).json({ error: "Invalid role provided" });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ message: "Logout operation completed successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


router.patch("/restaurantProfileEdit", verifyTokenAndDevice, async (req, res) => {
  const { location, restaurantName, longitude, latitude, email, phoneNumber } = req.body;

  // Check if any required field is missing in the request body
  if (!location || !restaurantName || !longitude || !latitude || !email || !phoneNumber) {
    return res.status(400).json("Please provide all required data");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Search for a restaurant document with the provided email
    const existingRestaurant = await restaurant.findOne({ email }).session(session);

    if (!existingRestaurant) {
      // If no document is found, return a 404 error
      return res.status(404).json("User not found");
    } else {
      // If a document is found, update its fields with the provided data
      existingRestaurant.locationExist = location;
      existingRestaurant.restaurantName = restaurantName;
      existingRestaurant.longitude = longitude;
      existingRestaurant.latitude = latitude;
      existingRestaurant.phoneNumber = phoneNumber;
      existingRestaurant.location = { type: "Point", coordinates: [longitude, latitude] };

      // Save the updated restaurant document
      await existingRestaurant.save({ session });

      // Convert latitude and longitude to numbers
      const lat = parseFloat(latitude);
      const long = parseFloat(longitude);
      await menu.updateMany(
        { email: email },
        [
          {
            $set: {
              restaurantName: {
                $cond: [{ $ne: ["$restaurantName", restaurantName] }, restaurantName, "$restaurantName"]
              },
              longitude: {
                $cond: [{ $ne: ["$longitude", longitude] }, longitude, "$longitude"]
              },
              latitude: {
                $cond: [{ $ne: ["$latitude", latitude] }, latitude, "$latitude"]
              },
              "location.coordinates": {
                $cond: [
                  { $eq: ["$location.coordinates", [long, lat]] }, // Check if coordinates match
                  "$location.coordinates", // If coordinates match, keep the existing value
                  [long, lat] // If coordinates don't match, update with new values
                ]
              },
              phoneNumber: {
                $cond: [{ $ne: ["$phoneNumber", phoneNumber] }, phoneNumber, "$phoneNumber"]
              }
            }
          }
        ],
        { session }
      );

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      // Respond with a success message
      res.status(200).json("Restaurant updated successfully");
    }
  } catch (error) {
    // Rollback the transaction on error
    await session.abortTransaction();
    session.endSession();

    // Handle any errors
    res.status(500).json("Internal server error");
  }
});


router.get("/restaurantProfileData", async (req, res) => {
  const { email } = req.query;

  // Check if any required field is missing in the request body
  if (!email) {
    return res.status(400).json("Please provide email");
  }

  try {
    // Search for a restaurant document with the provided email
    const existingRestaurant = await restaurant.findOne({ email });

    if (!existingRestaurant) {
      // If no document is found, return a 404 error
      return res.status(404).json("User not found");
    } else {
      // Send the restaurant document as the response
      res.status(200).json(existingRestaurant);
    }
  } catch (error) {
    // Handle any errors
    res.status(500).json("Internal server error");
  }
});

// get restaurant account
router.get("/getAccount", verifyTokenAndDevice, async (req, res) => {
  const { email } = req.query;

  try {
    // Check if the userEmail parameter is provided
    if (!email) {
      return res.status(400).json("Please provide the userEmail parameter.");
    }

    // Query the collection to find the document with the provided email
    const document = await restaurant.findOne({ email });

    if (!document) {
      return res.status(404).json("Document not found for the provided email.");
    }

    // If document is found, send it as a response
    res.status(200).json(document);
  } catch (error) {
    // Handle any errors
    res.status(500).json("Internal server error");
  }
});

router.post("/menuUpload", async (req, res) => {
  const { title, description, price, email, phoneNumber, restaurantName, latitude, longitude, url, type, categories, additionalFields,comparePrice,restaurantId } = req.body;
  const status = "In review";

  // Check if any required field is missing in the request body
  if (!restaurantId || !title || !description || !price || !email || !phoneNumber || !restaurantName || !latitude || !longitude || !url || !type) {
    return res.status(400).json({ error: "Please provide all required data." });
  }

  try {
    // Check the number of documents already existing with the provided email
    const menuCount = await menu.countDocuments({ email });

    // If the number of existing menus is more than 15, send a response indicating the limit
    if (menuCount >= 49) {
      return res.status(400).json({ error: "Cannot upload more than 49 menus per account." });
    }

    // Create a new menu document
    const newMenu = new menu({
      restaurantId,
      title,
      description,
      price,
      comparePrice,
      email,
      phoneNumber,
      restaurantName,
      status,
      latitude,
      longitude,
      url,
      type,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      categories: categories || [],
      additionalFields: additionalFields || {}
    });

    // Save the menu document to the database
    await newMenu.save();

    // Send a success response
    res.status(200).json({ message: 'Menu uploaded successfully', menu: newMenu });
  } catch (error) {
    // Handle any errors
    console.log(error);
    res.status(500).json("Internal server error");
  }
});

router.patch("/updateMenu", verifyTokenAndDevice, async (req, res) => {
  const { title, description, price, id,comparePrice, availableStatus,categories } = req.body;

  // Check if any required field is missing in the request body
  if (!title || !description || !price || !id || !availableStatus || !categories) {
    return res.status(400).json("Please provide all required data.");
  }

  try {
    // Find the menu document by its ID
    const existingMenu = await menu.findById(id);

    // Check if the menu exists
    if (!existingMenu) {
      return res.status(404).json("Menu not found");
    }

    // Update the fields
    existingMenu.title = title;
    existingMenu.description = description;
    existingMenu.availableStatus = availableStatus;
    existingMenu.price = price;
    existingMenu.comparePrice = comparePrice;
    existingMenu.categories = categories;

    // Save the updated menu document
    await existingMenu.save();

    // Send a success response
    res.status(200).json({ message: 'Menu updated successfully' });
  } catch (error) {
    // Handle any errors
    res.status(500).json("Internal server error");
  }
});


router.get("/fetchMenu", verifyTokenAndDevice, async (req, res) => {
  const { email } = req.query;

  // Check if any required field is missing in the request body
  if (!email) {
    return res.status(400).json("Please provide all required data.");
  }

  try {
    // Query MongoDB to find all documents where email matches
    const menus = await menu.find({ email });

    // Send the found menus as response
    res.status(200).json(menus);
  } catch (error) {
    // Handle any errors
    res.status(500).json("Internal server error");
  }
});


router.delete("/deleteMenu", verifyTokenAndDevice, async (req, res) => {
  const { id } = req.query; // Access id from URL params
  // Check if any required field is missing in the request params
  if (!id) {
    return res.status(400).json({ error: "Id not found." });
  }

  try {
    // Delete the menu by its id
    await menu.deleteOne({ _id: id });

    // Send a success response
    res.status(200).json({ message: "Menu deleted successfully" });
  } catch (error) {
    // Handle any errors
    res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/feesCalculator", async (req, res) => {
  const { startCoordinates, endCoordinates } = req.query;

  if (!startCoordinates || !endCoordinates) {
    return res.status(400).json("Coordinates not found.");
  }

  try {
    const accessToken = process.env.DISTANCE_KEY;
    const apiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoordinates};${endCoordinates}?access_token=${accessToken}`;

    const response = await fetch(apiUrl, {
      method: 'GET'
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Internal server error." });
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return res.status(400).json({ error: "No route found for the provided coordinates." });
    }

    const routeInfo = data.routes[0];
    const distanceInKm = routeInfo.distance / 1000;

    let roundedDistanceInKm;
    if (distanceInKm < 0.1) {
      // If distance is less than 100 meters, round to 3 decimal places
      roundedDistanceInKm = distanceInKm.toFixed(3);
    } else {
      // Otherwise, round to 2 decimal places
      roundedDistanceInKm = distanceInKm.toFixed(2);
    }

    // Calculate delivery fees based on distance
    let deliveryFees = 18;
    let processingFees = 12;

    // Your fee calculation logic goes here...
    // For example:
    if (distanceInKm <= 1) {
      deliveryFees = 18;
      processingFees = 12;
    } else if (distanceInKm > 1 && distanceInKm <= 2) {
      deliveryFees = 23;
      processingFees = 12;
    } else if (distanceInKm > 2 && distanceInKm <= 3) {
      deliveryFees = 29;
      processingFees = 11;
    } else if (distanceInKm > 3 && distanceInKm <= 4) {
      deliveryFees = 33;
      processingFees = 12;
    } else if (distanceInKm > 4 && distanceInKm <= 5) {
      deliveryFees = 36;
      processingFees = 14;
    } else if (distanceInKm > 5 && distanceInKm <= 6) {
      deliveryFees = 40;
      processingFees = 15;
    } else if (distanceInKm > 6 && distanceInKm <= 7) {
      deliveryFees = 43;
      processingFees = 17;
    } else if (distanceInKm > 7 && distanceInKm <= 8) {
      deliveryFees = 47;
      processingFees = 18;
    } else if (distanceInKm > 8 && distanceInKm <= 9) {
      deliveryFees = 50;
      processingFees = 20;
    } else if (distanceInKm > 9 && distanceInKm <= 10) {
      deliveryFees = 54;
      processingFees = 21;
    } else if (distanceInKm > 10 && distanceInKm <= 11) {
      deliveryFees = 57;
      processingFees = 23;
    } else if (distanceInKm > 11 && distanceInKm <= 12) {
      deliveryFees = 60;
      processingFees = 25;
    } else if (distanceInKm > 12 && distanceInKm <= 13) {
      deliveryFees = 64;
      processingFees = 26;
    }
    // Add more conditions for different distances if needed...

    res.status(200).json({ processingFees, deliveryFees, distanceInKm: roundedDistanceInKm });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get("/pickNdropDistance", async (req, res) => {
  const { startPickUpCoordinates, endPickUpCoordinates, startDropCoordinates, endDropCoordinates } = req.query;

  if (!startPickUpCoordinates || !endPickUpCoordinates || !startDropCoordinates || !endDropCoordinates) {
    return res.status(400).json("Coordinates not found.");
  }

  try {
    const accessToken = process.env.DISTANCE_KEY;

    const pickUpApiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startPickUpCoordinates};${endPickUpCoordinates}?access_token=${accessToken}`;
    const dropApiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startDropCoordinates};${endDropCoordinates}?access_token=${accessToken}`;

    const [pickUpResponse, dropResponse] = await Promise.all([
      fetch(pickUpApiUrl, { method: 'GET' }),
      fetch(dropApiUrl, { method: 'GET' })
    ]);

    if (!pickUpResponse.ok || !dropResponse.ok) {
      return res.status(500).json({ error: "Internal server error." });
    }

    const pickUpData = await pickUpResponse.json();
    const dropData = await dropResponse.json();

    if (!pickUpData.routes || pickUpData.routes.length === 0) {
      return res.status(400).json({ error: "No route found for the provided pickup coordinates." });
    }

    if (!dropData.routes || dropData.routes.length === 0) {
      return res.status(400).json({ error: "No route found for the provided drop coordinates." });
    }

    const pickUpDistanceInKm = pickUpData.routes[0].distance / 1000;
    const dropDistanceInKm = dropData.routes[0].distance / 1000;

    res.status(200).json({
      pickUpDistance: pickUpDistanceInKm.toFixed(1), // Round to 1 decimal place
      dropDistance: dropDistanceInKm.toFixed(1) // Round to 1 decimal place
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.get("/reverse-geocode", async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    // Validate query parameters
    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Latitude and longitude are required." });
    }

    // Construct the URL for the Ola Map API
    const olaApiUrl = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${latitude},${longitude}&api_key=tPcAo1WOSNtjyz36AgcnJ8MyLqv6uNLVbWR3Yd4k`;

    // Generate a unique request ID
    const requestId = uuidv4(); // Generates a new unique ID

    // Fetch data from Ola Map API with X-Request-Id header
    const response = await fetch(olaApiUrl, {
      headers: {
        'X-Request-Id': requestId
      }
    });

    if (!response.ok) {
      return res.status(500).json({ message: response.statusText });
    }

    // Parse the JSON response
    const data = await response.json();

    // Extract the formatted address and name from the first result
    if (data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      const formattedAddress = firstResult.formatted_address;
      const name = firstResult.name || 'No name available'; // Handle case where name might be missing
      res.json({ formatted_address: formattedAddress, name: name });
    } else {
      res.status(404).json({ message: "No results found." });
    }

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error." });
  }
});

router.post("/deliveryProfile", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(401).json({ error: "Unauthorized request." });
  }

  try {
    const deliveryProfileInfo = await deliveryPartner.findOne({ email });
    if (deliveryProfileInfo) {
      res.status(200).json(deliveryProfileInfo);
    } else {
      res.status(404).json({ error: "User not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});


router.patch("/updateDeliveryProfileInfo", verifyTokenAndDevice, async (req, res) => {
  const { email, profileImage, phoneNumber, username } = req.body;

  try {
    // Check if any of the required fields are missing
    if (!email || !profileImage || !phoneNumber || !username) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Check if the imageUrl starts with the expected prefix
    if (!profileImage.startsWith("https://firebasestorage.googleapis.com/v0/b/xferyfood.appspot.com/")) {
      return res.status(400).json({ error: "Invalid imageUrl format." });
    }

    // Find the delivery partner profile by email
    const deliveryProfileInfo = await deliveryPartner.findOne({ email });

    if (!deliveryProfileInfo) {
      return res.status(404).json({ error: "User not found." });
    }

    // Update the profile information
    deliveryProfileInfo.profileImage = profileImage;
    deliveryProfileInfo.phoneNumber = phoneNumber;
    deliveryProfileInfo.userName = username;

    // Save the updated profile
    await deliveryProfileInfo.save();

    // Send the updated profile information in the response
    res.status(200).json({ message: "Update Completed." });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error." });
  }
});


router.patch("/orderResolver", verifyTokenAndDevice, async (req, res) => {
  const { orderId } = req.body;
  
  try {
    if (!orderId) {
      return res.status(401).json({ error: "Unauthorized request." });
    }

    const resolveOrder = await order.findOneAndUpdate(
      { orderId: orderId }, // Query to find the order by its ID
      { $set: { status: "delivered" } }, // Update the status field to "delivered"
      { new: true } // Return the updated document
    );

    if (!resolveOrder) {
      return res.status(404).json({ error: "Order not found." });
    }

    return res.status(200).json({ message: "Order resolve successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});


router.post("/graphEarningData", async (req, res) => {
  const { email, role } = req.body;
  try {
    if (!email || !role) {
      return res.status(400).json({ error: "Invalid request. Email and role are required." });
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const thisMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const thisYearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1, 0, 0, 0));

    const graphData = await order.find({
      $or: [
        { deliveryEmail: email },
        { restaurantEmail: email }
      ],
      createdAt: { $gte: thisYearStart },
      status: { $ne: "cancel" } // Exclude documents with status equal to "cancel"
    }).select('createdAt price deliveryFees quantity status assignStatus');    

    const responseData = {
      monthly: calculateMonthlyEarnings(graphData, thisMonthStart, role),
      today: calculateDailyEarnings(graphData, today, role),
      yesterday: calculateDailyEarnings(graphData, yesterday, role),
      weekly: calculateWeeklyEarnings(graphData, today, role),
      yearly: calculateYearlyEarnings(graphData, role)
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

function calculateMonthlyEarnings(data, startDate, role) {
  const weeksData = [];

  // Get the first day of the current month
  const currentMonthFirstDay = new Date(startDate);

  // Iterate through each week of the month
  while (currentMonthFirstDay.getUTCMonth() === startDate.getUTCMonth()) {
    const weekStart = new Date(currentMonthFirstDay);
    const weekEnd = new Date(currentMonthFirstDay);
    weekEnd.setDate(weekStart.getDate() + 7);

    // Calculate total earnings for the current week
    const totalEarnings = calculateTotalEarningsForWeek(data, weekStart, weekEnd, role);

    // Push the week's earnings to the result array
    weeksData.push(totalEarnings);

    // Move to the start of the next week
    currentMonthFirstDay.setDate(currentMonthFirstDay.getDate() + 7);
  }

  return weeksData;
}

function calculateTotalEarningsForWeek(data, startDate, endDate, role) {
  let totalEarnings = 0;

  data.forEach(order => {
    const orderDate = new Date(order.createdAt);
    if (orderDate >= startDate && orderDate <= endDate) {
      let totalPrice = 0;
      if (Array.isArray(order.price)) {
        totalPrice = order.price.reduce((total, price, index) => {
          const quantity = parseInt(order.quantity[index]) || 1;
          return total + (parseInt(price) * quantity);
        }, 0);
      } else {
        const quantity = parseInt(order.quantity) || 1;
        totalPrice = parseInt(order.price) * quantity;
      }
      // If the role is deliveryPartner and the assignStatus is assign, add deliveryFees and processingFees
      if (role === "deliveryPartner" && order.assignStatus === "assign") {
        totalEarnings += parseInt(order.deliveryFees) + parseInt(order.processingFees);
      } else if (role === "restaurant") {
        totalEarnings += totalPrice;
      }
    }
  });

  return totalEarnings;
}



function calculateDailyEarnings(data, currentDate, role) {
  const timeSlots = [
    "12:00 AM - 3:00 AM",
    "3:00 AM - 6:00 AM",
    "6:00 AM - 9:00 AM",
    "9:00 AM - 12:00 PM",
    "12:00 PM - 3:00 PM",
    "3:00 PM - 6:00 PM",
    "6:00 PM - 9:00 PM",
    "9:00 PM - 12:00 AM"
  ];

  const earnings = Array(timeSlots.length).fill(0);

  data.forEach(order => {
    const orderDate = new Date(order.createdAt);
    if (isSameDay(orderDate, currentDate)) {
      let totalPrice = 0;
      if (Array.isArray(order.price)) {
        totalPrice = order.price.reduce((total, price, index) => {
          const quantity = parseInt(order.quantity[index]) || 1;
          return total + (parseInt(price) * quantity);
        }, 0);
      } else {
        const quantity = parseInt(order.quantity) || 1;
        totalPrice = parseInt(order.price) * quantity;
      }
      if (role === "deliveryPartner" && order.assignStatus === "assign") {
        const orderHour = orderDate.getUTCHours();
        const index = Math.floor((orderHour - 0) / 3); // Shift start time to 6 AM and then divide by 3 hours interval
        earnings[index] += parseInt(order.deliveryFees) + parseInt(order.processingFees);
      } else if (role === "restaurant") {
        const orderHour = orderDate.getUTCHours();
        const index = Math.floor((orderHour - 0) / 3); // Shift start time to 6 AM and then divide by 3 hours interval
        earnings[index] += totalPrice;
      }
    }
  });

  return earnings;
}


function calculateWeeklyEarnings(data, currentDate, role) {
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const earnings = Array(weekDays.length).fill(0);

  const currentWeek = getWeekNumber(currentDate);

  data.forEach(order => {
    const orderDate = new Date(order.createdAt);
    const orderWeek = getWeekNumber(orderDate);
    const dayIndex = orderDate.getUTCDay(); // Get UTC day instead of local day

    if (currentWeek === orderWeek && (role !== "deliveryPartner" || order.assignStatus === "assign")) {
      let totalPrice = 0;
      if (Array.isArray(order.price) && Array.isArray(order.quantity)) {
        totalPrice = order.price.reduce((total, price, index) => {
          const quantity = parseInt(order.quantity[index]);
          return total + (parseInt(price) * quantity);
        }, 0);
      } else {
        const quantity = parseInt(order.quantity) || 1;
        totalPrice = parseInt(order.price) * quantity;
      }
      // If the role is deliveryPartner and the assignStatus is assign, add deliveryFees and processingFees
      if (role === "deliveryPartner") {
        earnings[dayIndex] += parseInt(order.deliveryFees) + parseInt(order.processingFees);
      } else {
        earnings[dayIndex] += totalPrice;
      }
    }
  });

  return earnings;
}



function calculateYearlyEarnings(data, role) {
  const yearlyEarnings = Array(12).fill(0);

  data.forEach(order => {
    const orderMonth = new Date(order.createdAt).getUTCMonth();
    let totalPrice = 0;

    if (Array.isArray(order.price) && Array.isArray(order.quantity)) {
      totalPrice = order.price.reduce((total, price, index) => {
        const quantity = parseInt(order.quantity[index]);
        return total + (parseInt(price) * quantity);
      }, 0);
    } else {
      const quantity = parseInt(order.quantity) || 1;
      totalPrice = parseInt(order.price) * quantity;
    }

    // If the role is deliveryPartner and the assignStatus is assign, add deliveryFees and processingFees
    if (role === "deliveryPartner" && order.assignStatus === "assign") {
      yearlyEarnings[orderMonth] += parseInt(order.deliveryFees) + parseInt(order.processingFees);
    } else {
      yearlyEarnings[orderMonth] += totalPrice;
    }
  });

  return yearlyEarnings;
}



function isSameDay(date1, date2) {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

// Function to get the ISO week number of a given date
function getWeekNumber(date) {
  // Copy date so don't modify original
  date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNumber = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  // Return week number
  return weekNumber;
}





router.post("/unpaidOrderList", async (req, res) => {
  const { email, role } = req.body;

  try {
    if (!email || !role) {
      return res.status(401).json({ error: "Please provide required data" });
    }

    // Find unpaid orders with status 'delivered' for the given email
    const unPaidList = await order.find({ restaurantEmail: email, status: 'delivered', billingStatus: 'unpaid' });

    // Return the unpaid order list
    res.status(200).json({ unpaidOrders: unPaidList });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/getFullRestaurant", async (req, res) => {
  const { restaurantEmail } = req.body;

  // Validate that restaurantEmail is provided
  if (!restaurantEmail) {
    return res.status(400).json({ error: "Restaurant email is required." });
  }

  try {
    // Query the database for the restaurant
    const restaurant = await menu.find({ email: restaurantEmail, status: "Active" });

    // Check if the restaurant exists
    if (restaurant.length === 0) {
      return res.status(404).json({ error: "No active restaurant found." });
    }

    // If restaurant found, return it
    return res.status(200).json({ menus: restaurant });
  } catch (error) {
    // Internal server error
    return res.status(500).json({ error: "Internal server error." });
  }
});


router.post("/orderStatistics", async (req, res) => {
  // Check if email is sent in the request body
  if (!req.body || !req.body.email) {
    return res.status(400).json({ message: "Email is required in the request body." });
  }
  const { email } = req.body;

  // Get today's date
  const today = new Date();
  // Set the time to the beginning of the day (midnight)
  today.setHours(0, 0, 0, 0);

  // Set the time to the end of the day (just before midnight)
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const [newOrdersCount, totalDailyOrdersCount] = await Promise.all([
      order.countDocuments({ deliveryEmail: email, status: "preparing", assignStatus: { $ne: "assign" }, createdAt: { $gte: today, $lte: endOfDay } }),
      order.countDocuments({ deliveryEmail: email, status: { $ne: "cancel" }, createdAt: { $gte: today, $lte: endOfDay } })
    ]);

    const response = [{ newOrder: newOrdersCount, totalDailyOrder: totalDailyOrdersCount }];
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post('/customerProfile', async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(401).json({ message: "Email is require." })
    }
    // Find customer profile information by email, excluding loginDvice field
    const customerProfileInfo = await customer.findOne(
      { email },
      { loginDevices: 0 } // Exclude loginDvice field from the result
    );

    if (!customerProfileInfo) {
      return res.status(404).json({ message: "User not found." });
    }

    // Return customer profile information in the response body
    res.status(200).json(customerProfileInfo);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


router.patch('/customerProfileEdit', async (req, res) => {
  const { email, data } = req.body;

  try {
    if (!email || !data) {
      return res.status(400).json({ message: "Email and data are required." });
    }

    // Update customer profile information
    const updatedCustomer = await customer.findOneAndUpdate(
      { email },
      { $set: data }, // Use $set to update fields specified in the data object
      { new: true } // Return the updated document
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: "User not found." });
    }

    // Return the updated customer profile information in the response body
    res.status(200).json(updatedCustomer);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/loginHistories", verifyTokenAndDevice, async (req, res) => {
  const { email, role } = req.body;
  try {
    if (!email || !role) {
      return res.status(401).json({ message: "Unauthorized request." })
    }

    let userLoginHistories;

    // Depending on the role, query the respective collection
    switch (role) {
      case "customer":
        userLoginHistories = await customer.findOne({ email }, "loginDevices");
        break;
      case "restaurant":
        userLoginHistories = await restaurant.findOne({ email }, "loginDevices");
        break;
      case "deliveryPartner":
        userLoginHistories = await deliveryPartner.findOne({ email }, "loginDevices");
        break;
      default:
        return res.status(400).json({ message: "Invalid role." });
    }

    if (!userLoginHistories) {
      return res.status(404).json({ message: "User not found." });
    }

    // If userLoginHistories is found, send it back
    res.status(200).json({ loginDevices: userLoginHistories });

  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


router.post("/reportBugs", async (req, res) => {
  const { email, role, comment, userName } = req.body;

  try {
    // Validate the incoming request body
    if (!email || !role || !comment || !userName) {
      return res.status(400).json({ message: "Missing required fields." });
    } else if (comment.length > 250) {
      return res.status(400).json({ message: "Please write it short." });
    }

    // Create a new bug report document
    const newBugReport = new bugReport({
      email,
      userName,
      role,
      comment
    });

    // Save the bug report document to the database
    await newBugReport.save();

    res.status(201).json({ message: "Bug report submitted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/feedbacks", async (req, res) => {
  const { email, role, comment, userName, emoji } = req.body;

  try {
    // Validate the incoming request body
    if (!email || !role || !comment || !userName || !emoji) {
      return res.status(400).json({ message: "Missing required fields." });
    } else if (comment.length > 150) {
      return res.status(400).json({ message: "Please write it short." });
    }

    // Create a new feedback document
    const newFeedback = new feedback({
      email,
      userName,
      role,
      emoji,
      comment
    });

    // Save the feedback document to the database
    await newFeedback.save();

    res.status(201).json({ message: "Feedback submitted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


router.patch("/restaurantLogoUpload", verifyTokenAndDevice, async (req, res) => {
  const { email, description, imageUrl } = req.body;

  try {
    if (!email || !imageUrl) {
      return res.status(401).json({ message: "Missing required fields." })
    }
    // Find the restaurant document based on the email
    const updateRestaurant = await restaurant.findOneAndUpdate(
      { email: email }, // Search criteria
      { description: description, logo: imageUrl }, // New values to update
      { new: true } // Return the updated document
    );

    if (updateRestaurant) {
      // Restaurant document updated successfully
      res.status(200).json({ message: "Restaurant updated successfully.", updatedRestaurant: updateRestaurant });
    } else {
      // Restaurant not found with the provided email
      res.status(404).json({ message: "Restaurant not found with the provided email." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.patch("/restaurantDocumentUpload", verifyTokenAndDevice, async (req, res) => {
  const { email, imageUrl, documentExpiration } = req.body;

  try {
    if (!email || !imageUrl || !documentExpiration) {
      return res.status(401).json({ message: "Missing required fields." })
    }
    // Find the restaurant document based on the email
    const updateRestaurant = await restaurant.findOneAndUpdate(
      { email: email }, // Search criteria
      { documentImageUrl: imageUrl, documentExpiration }, // New values to update
      { new: true } // Return the updated document
    );

    if (updateRestaurant) {
      // Restaurant document updated successfully
      res.status(200).json({ message: "Restaurant updated successfully.", updatedRestaurant: updateRestaurant });
    } else {
      // Restaurant not found with the provided email
      res.status(404).json({ message: "Restaurant not found with the provided email." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.patch("/deliveryDocumentUpload", verifyTokenAndDevice, async (req, res) => {
  const { email, imageUrl, documentExpiration,documentNumber,vehicleType } = req.body;

  try {
    if (!email || !imageUrl || !documentNumber || !vehicleType) {
      return res.status(401).json({ message: "Missing required fields." })
    }
    // Find the restaurant document based on the email
    const updatePartner = await deliveryPartner.findOneAndUpdate(
      { email: email }, // Search criteria
      { documentImageUrl: imageUrl, documentExpiration,documentNumber,vehicleType }, // New values to update
      { new: true } // Return the updated document
    );

    if (updatePartner) {
      // Restaurant document updated successfully
      res.status(200).json({ message: "delivery partner updated successfully.", updatedRestaurant: updatePartner });
    } else {
      // Restaurant not found with the provided email
      res.status(404).json({ message: "delivery partner not found with the provided email." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post('/sendLinkRequest', async (req, res) => {
  let { email, userId, latitude, longitude, requestSentTo, requestSentBy, userName } = req.body;

  try {
    if (!email || !latitude || !longitude || !requestSentTo || !requestSentBy || !userName) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Remove spaces and convert to lowercase
    requestSentTo = requestSentTo.replace(/\s/g, '').toLowerCase();

    // Check if any existing link request document already has both email and requestSentTo
    const existingLinkRequest = await linkRequest.findOne({
      $or: [
        { email, requestSentTo },
        { email: requestSentTo, requestSentTo: email }
      ]
    });

    if (existingLinkRequest) {
      if (existingLinkRequest.requestSentBy === requestSentBy) {
        return res.status(400).json({ message: 'You have already sent a request to this user.' });
      } else {
        return res.status(400).json({ message: 'You have already received a request from this user.' });
      }
    }

    const newLinkRequest = new linkRequest({
      email,
      userId,
      latitude,
      longitude,
      userName,
      requestSentTo,
      requestSentBy
    });

    await newLinkRequest.save();

    res.status(201).json({ message: 'Link request saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});


router.post("/allRequest", async (req, res) => {
  const { requestSentTo } = req.body;
  try {
    const getAllRequest = await linkRequest.find({ requestSentTo });
    if (!getAllRequest.length) { // Check if getAllRequest is an empty array
      return res.status(404).json({ message: "No request found." });
    }
    res.status(200).json(getAllRequest);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.patch("/acceptLinkRequest", verifyTokenAndDevice, async (req, res) => {
  const { restaurantEmail, deliveryEmail } = req.body;

  const session = await mongoose.startSession();

  try {
    if (!restaurantEmail || !deliveryEmail) {
      return status(401).json({ message: "All fields are required." })
    }
    await session.withTransaction(async () => {
      // Find the restaurant document by restaurantEmail
      const acceptRequest = await restaurant.findOne({ email: restaurantEmail }).session(session);

      if (!acceptRequest) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      // Check if the deliveryEmail already exists in the linkIds array
      const emailExists = acceptRequest.linkIds.some(link => link.email === deliveryEmail);

      if (emailExists) {
        return res.status(400).json({ message: "email already linked." });
      }

      // Add the new deliveryEmail and name to the linkIds array
      acceptRequest.linkIds.push({ email: deliveryEmail });

      // Save the updated document
      await acceptRequest.save();

      // Delete the document from linkRequest collection where restaurantEmail and deliveryEmail match
      await linkRequest.deleteOne({
        $and: [
          {
            $or: [
              { requestSentTo: restaurantEmail },
              { email: restaurantEmail }
            ]
          },
          {
            $or: [
              { requestSentTo: deliveryEmail },
              { email: deliveryEmail }
            ]
          }
        ]
      }).session(session);


      res.status(200).json({ message: "email linked successfully." });
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  } finally {
    session.endSession();
  }
});


router.post("/getRestaurantLinkIDs", async (req, res) => {
  const { email } = req.body;
  try {
    const restaurants = await restaurant.find({ email });
    if (!restaurants || restaurants.length === 0) {
      return res.status(404).json({ message: "No IDs found" });
    }

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/getDeliveryLinkIDs", async (req, res) => {
  const { email } = req.body;

  try {
    const restaurants = await restaurant.find({ "linkIds.email": email });
    if (!restaurants || restaurants.length === 0) {
      return res.status(404).json({ message: "No IDs found" });
    }

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


router.delete("/unLinkIDs", verifyTokenAndDevice, async (req, res) => {
  const { deliveryEmail, restaurantEmail } = req.body;

  // Start a session
  const session = await mongoose.startSession();

  try {
    // Start a transaction
    session.startTransaction();

    // Update the restaurant document to remove the deliveryEmail from linkIds
    const restaurantUpdateResult = await restaurant.updateOne(
      { email: restaurantEmail },
      { $pull: { linkIds: { email: deliveryEmail } } },
      { session }
    );

    if (restaurantUpdateResult.modifiedCount === 0) {
      // Abort the transaction if the restaurant update fails
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Email not linked to restaurant or restaurant not found" });
    }

    // Update the delivery partner document to set the linkStatus field to "unlinked"
    const deliveryPartnerUpdateResult = await deliveryPartner.updateOne(
      { email: deliveryEmail },
      { $set: { linkStatus: "unlinked" } },
      { session }
    );

    if (deliveryPartnerUpdateResult.modifiedCount === 0) {
      // Abort the transaction if the delivery partner update fails
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Delivery partner not found or already unlinked" });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Email unlinked successfully and delivery partner updated" });
  } catch (error) {
    // If an error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


router.get("/checkSelfDeliveryStatus", async (req, res) => {
  const { email } = req.query;
  try {
    if (!email) {
      return res.status(401).json({ message: "email required." });
    }
    const checkStatus = await restaurant.findOne({ email });
    if (!checkStatus) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if linkIds field is empty
    if (!checkStatus.linkIds || checkStatus.linkIds.length === 0) {
      await restaurant.findOneAndUpdate(
        { email },
        { $set: { selfDelivery: "off" } }
      );
      return res.status(404).json({ message: "No linkIds found.", selfDelivery: checkStatus.selfDelivery });
    }

    // Respond with the selfDelivery status
    res.status(200).json({ selfDelivery: checkStatus.selfDelivery });

  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});




router.patch("/updateSelfDeliveryStatus", async (req, res) => {
  const { email, status } = req.body;
  try {
    if (!email || !status) {
      return res.status(401).json({ message: "All fields are required." });
    }

    const checkLinkIds = await restaurant.findOne({ email }).select('linkIds');
    // Check if linkIds field is empty
    if (!checkLinkIds.linkIds || checkLinkIds.linkIds.length === 0) {
      return res.status(404).json({ message: "You have no delivery partners linked. Please link with a delivery partner first to use this feature." });
    }

    // Update the selfDelivery status and return the updated document
    const updateDateStatus = await restaurant.findOneAndUpdate(
      { email },
      { $set: { selfDelivery: status } },
      { new: true }
    );

    // Check if any documents were updated
    if (updateDateStatus.nModified === 0) {
      return res.status(404).json({ message: "User not found or no changes made." });
    }

    res.status(200).json({ message: "Self delivery status updated successfully." });

  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


// router.post('/payDue', async (req, res) => {
//   const { orderIds, amount, email, name, phoneNumber, id } = req.body;
//   const clientId = process.env.CLIENT_ID;
//   const clientSecret = process.env.CLIENT_SECRET;

//   try {
//     const response = await fetch('https://sandbox.cashfree.com/pg/orders', {
//       method: 'POST',
//       headers: {
//         'X-Client-Secret': clientSecret,
//         'X-Client-Id': clientId,
//         'x-api-version': '2023-08-01',
//         'Content-Type': 'application/json',
//         'Accept': 'application/json'
//       },
//       body: JSON.stringify({
//         order_amount: amount,
//         order_currency: "INR",
//         customer_details: {
//           customer_id: "USER123",
//           customer_name: name,
//           customer_email: email,
//           customer_phone: phoneNumber
//         },
//         "order_tags": {
//           orderIds
//         }
//       })
//     });

//     const data = await response.json();
//     if (!response.ok) {
//       return res.status(500).json(`Error: ${data.message}`);
//     }

//     res.status(200).json(data);
//   } catch (error) {
//     console.log('Error creating order:', error.message);
//     res.status(500).json({ error: 'Failed to create order' });
//   }
// });

// router.post('/paymentWebhook', (req, res) => {
//   try {
//     // console.log(req.headers); // Log headers for debugging

//     const secretKey = process.env.CLIENT_SECRET;
//     const timestamp = req.headers['x-webhook-timestamp'];
//     const signature = req.headers['x-webhook-signature'];
//     const rawBody = req.rawBody; // Captured raw body from middleware

//     if (!timestamp || !signature) {
//       console.log('Missing headers');
//       return res.status(400).json('Missing headers');
//     }

//     const body = timestamp + rawBody;
//     const expectedSignature = crypto.createHmac('sha256', secretKey).update(body).digest('base64');

//     console.log("Signature sent:", signature);
//     console.log("Expected signature:", expectedSignature);

//     if (signature === expectedSignature) {
//       console.log('Signature is valid');
//       console.log('Payload:', req.body); // Log the payload for debugging
//       res.status(200).json('Webhook received');
//     } else {
//       console.log('Signature is invalid');
//       // console.log('Payload:', req.body);
//       res.status(400).json('Invalid signature');
//     }
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).json({ message: err.message });
//   }
// });

// Endpoint to add/update bank details 
router.patch("/updateBankDetails", async (req, res) => {
  try {
    const { email, role, ifscCode, accountNumber, accountHolderName } = req.body;

    // Validate input fields
    if (!email || !role || !ifscCode || !accountNumber || !accountHolderName) {
      return res.status(401).json({ message: "Required field missing!" });
    }

    let collection;
    if (role === "restaurant") {
      collection = restaurant;
    } else if (role === "deliveryPartner") {
      collection = deliveryPartner; 
    } else if (role === "customer") {
      return res.status(403).json({ message: "Not applicable for customers." });
    } else {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    // Find the document by email
    const user = await collection.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

      // Check if bank details are still set to "not set"
      if (user.ifscCode !== "not set" || user.accountNumber !== "not set" || user.accountHolderName !== "not set") {
        return res.status(403).json({ message: "Bank details cannot be changed. Contact support for assistance." });
      }

    // Perform atomic update
    const updateResult = await collection.updateOne(
      { email }, // Filter
      { $set: { ifscCode, accountNumber, accountHolderName } } // Update operation
    );

    if (updateResult.nModified === 0) {
      return res.status(500).json({ message: "Failed to update bank details." });
    }

    return res.status(200).json({ message: "Bank details updated successfully." });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error." });
  }
});


// Endpoint to get balance of restaurant or delivery partner
router.post("/getWalletBalance", async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required!" });
    }

    let wallet;

    if (role === "restaurant") {
      wallet = await restaurant.findOne({ email }).select('balance accountNumber'); // Assuming Restaurant is your Mongoose model for restaurants
    } else if (role === "deliveryPartner") {
      wallet = await deliveryPartner.findOne({ email }).select('balance accountNumber'); // Assuming DeliveryPartner is your Mongoose model for delivery partners
    } else {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    if (!wallet) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(wallet);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Internal server error." });
  }
});



// Endpoint to get payout orders of restaurant
router.post("/restaurantPayoutOrders", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email required!" });
    }

    const payoutOrders = await order.find(
      { 
        restaurantEmail: email,
        status: 'delivered',
        // onlinePaid: true
      },
      {
        orderId: 1,
        price: 1,
        createdAt: 1,
        customerName: 1
      }
    );

    if (payoutOrders.length === 0) {
      return res.status(200).json({ message: "No orders found." });
    }

    const processedOrders = payoutOrders.map(order => {
      const totalSum = order.price.reduce((sum, item) => sum + parseFloat(item), 0);
      return {
        orderId: order.orderId,
        price: totalSum,
        createdAt: order.createdAt,
        customerName: order.customerName
      };
    });

    res.status(200).json(processedOrders);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


// Create Order API Using POST Method
router.post('/create-order-razorpay', async (req, res) => {
  const { amount, notes } = req.body;

  // Create a new Razorpay instance inside the endpoint
  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const options = {
    amount: Number(amount * 100), // Convert amount to paise
    currency: "INR",
    receipt: crypto.randomBytes(10).toString("hex"), // Generate a random receipt ID
    partial_payment: false,
    notes: notes
  };

  try {
    const order = await instance.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/razorpay-paydue-webhook', async (req, res) => {
  const webhookSecret = process.env.WEBHOOK_SECRET_KEY; // Replace with your actual webhook secret

  // Step 2: Extract the signature from the headers
  const razorpaySignature = req.headers['x-razorpay-signature'];

  // Step 3: Generate a signature on your server using the request body and the webhook secret
  const generatedSignature = crypto.createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // Step 4: Compare the signatures
  if (razorpaySignature === generatedSignature) {

    // Extract orderIds from the payload
    const data = req.body;
    const paidIds = data.payload.payment.entity.notes.orderIds.split(',');

    try {
      // Update the billingStatus of the matching orders
      await order.updateMany(
        { orderId: { $in: paidIds } },
        { $set: { billingStatus: 'paid' } }
      );
      res.status(200).send('OK');
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(400).send('Bad Request');
  }
});

// Endpoint for payment verification
router.post('/validate-payment-razorpay', (req, res) => {
  const { order_id, payment_id, signature } = req.body;

  const order = `${order_id}|${payment_id}`;
  const generated_signature = crypto.createHmac('sha256', key_secret)
    .update(order)
    .digest('hex');

  if (generated_signature === signature) {
    res.status(200).send({ status: 'success', message: 'Payment verification successful' });
  } else {
    res.status(400).send({ status: 'failure', message: 'Payment verification failed' });
  }
});

router.patch("/updateDeliveryLiveLocation", async (req, res) => {
  const { coordinates, email } = req.body;

  try {
    if (!coordinates || !email) {
      return res.status(400).json({ message: "Coordinates or email missing." });
    }
    
    const deliveryPartnerExist = await deliveryPartner.findOne({ email });

    if (!deliveryPartnerExist) {
      return res.status(404).json({ message: "Delivery partner not found." });
    }

    if (deliveryPartnerExist.onlineStatus !== 'online') {
      return res.status(400).json({ message: "You are currently offline." });
    }

    deliveryPartnerExist.location = {
      type: "Point",
      coordinates: [coordinates.longitude, coordinates.latitude]
    };

    await deliveryPartnerExist.save();

    res.status(200).json({ message: "Location updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


// GET /users endpoint to fetch users by email in prefs.ActiveChat
router.get('/agent', async (req, res) => {
  try {
      const { email } = req.query; // Fetch email from query parameters

      if (!email) {
          return res.status(400).json({ error: 'Email query parameter is required' });
      }

      // Fetch all users from Appwrite
      const { users: allUsers } = await users.list();

      // Filter users where prefs.ActiveChat contains the specified email
      const filteredUsers = allUsers.filter(user => {
          if (user.prefs && user.prefs.ActiveChat) {
              const activeChats = user.prefs.ActiveChat.split(',');
              return activeChats.includes(email);
          }
          return false;
      });

      res.status(200).json(filteredUsers);
  } catch (error) {
      console.error('Error querying users:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/connectwithagent', async (req, res) => {
  try {
      const { email,name } = req.body;

      if (!email) {
          return res.status(400).json({ message: 'Email,name is required' });
      }

      // Fetch all users from Appwrite
      const { users: allUsers } = await users.list();

      // Filter users where prefs.onlineStatus is 'online' and prefs.ActiveChat has less than 10 entries
      const eligibleUsers = allUsers.filter(user => {
          if (user.prefs && user.prefs.onlineStatus === 'online') {
              const activeChats = user.prefs.ActiveChat ? user.prefs.ActiveChat.split(',') : [];
              return activeChats.length < 11;
          }
          return false;
      });

      if (eligibleUsers.length === 0) {
        return res.status(404).json({
            message: 'Currently, there are no available executives. All our executives are busy with other chats. Please try again later.'
        });
    }    

      // Find user(s) with the least number of entries in prefs.ActiveChat
      const minChats = Math.min(...eligibleUsers.map(user => user.prefs.ActiveChat ? user.prefs.ActiveChat.split(',').length : 0));
      const selectedUsers = eligibleUsers.filter(user => {
          const activeChats = user.prefs.ActiveChat ? user.prefs.ActiveChat.split(',') : [];
          return activeChats.length === minChats;
      });

      if (selectedUsers.length === 0) {
          return res.status(404).json({ message: 'No eligible agents found with minimum active chats' });
      }

      // Select the first user (or implement a more complex selection strategy)
      const selectedUser = selectedUsers[0];
      const activeChats = selectedUser.prefs.ActiveChat ? selectedUser.prefs.ActiveChat.split(',') : [];
      activeChats.push(email);
      const updatedActiveChats = activeChats.join(',');

      // Update the selected user's prefs.ActiveChat without altering onlineStatus
      const updatedPrefs = {
          ...selectedUser.prefs,
          ActiveChat: updatedActiveChats
      };

      await users.updatePrefs(selectedUser.$id, updatedPrefs);
       // Call the agentJoint function
       await agentJoint(selectedUser.email, selectedUser.name, email, name);


      res.status(200).json({ success: true, message: 'Email added to ActiveChat of the selected user', user: selectedUser });
  } catch (error) {
      console.log('Error querying users:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;