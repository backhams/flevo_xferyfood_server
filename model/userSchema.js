
const mongoose = require("mongoose");
const { Schema } = mongoose; // Destructure Schema from mongoose
const loginDeviceSchema = new mongoose.Schema({
  deviceName: {
    type: String,
    required: true,
  },
  deviceToken: {
    type: String,
    required: true,
  },
  deviceOs: {
    type: String
  },
  loginDate: {
    type: Date,
    default: Date.now,
  }
});

const orderFromSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
  },
  numberOfOrder: {
    type: Number,
    required: true,
  },
  amountSpentOnItem: {
    type: Number,
    required: true,
  },
  amountSpentOnDeliveryFees: {
    type: Number
  },
  firstOrderAt: {
    type: Date,
    default: Date.now,
  },
  lastOrderAt: {
    type: Date
  }
});

const linkingSchema = new mongoose.Schema({
  email: {
    type: String,
  },
  name: {
    type: String,
  },
  linkDate: {
    type: Date,
    default: Date.now,
  }
});


// Define the Option schema
const OptionSchema = new Schema({
  name: { type: String },
  price: { type: Number, default: 0 } // Optional price for each option
});

// Define the Category schema
const CategorySchema = new Schema({
  name: { type: String},
  options: [OptionSchema]
});


const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
  },
  phoneNumber: {
    type: String,
  },
  gender: {
    type: String,
  },
  dateOfBirth: {
    type: Date,
  },
  email: {
    type: String,
    required: true,
  },
  orderedRestaurant: [orderFromSchema],
  loginDevices: [loginDeviceSchema], // Array of login devices
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const bugSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
  comment: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const feedbackSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  comment: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const deliverySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    default: "not set"
  },
  email: {
    type: String,
    required: true,
  },
  profileImage: {
    type: String,
    default: "not set"
  },
  phoneNumber: {
    type: String,
    default: "not set"
  },
  dailyOrders: {
    type: Number,
    default:0
  },
  activeOrders: {
    type: Number,
    default:0
  },
  failedOrders: {
    type: Number,
    default:0
  },
  documentImageUrl: {
    type: String
  },
  documentStatus: {
    type: String,
    default:"In review"
  },
  documentNumber: {
    type: String
  },
  vehicleType: {
    type: String
  },
  location: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }
  },
  status: {
    type: String,
    default: "Inactive"
  },
  linkStatus: {
    type: String,
    default: "unlinked"
  },
  balance: {
    type: Number,
    defualt:0
  },
  accountNumber: {
    type: String,
    defualt:"not set"
  },
  ifscCode: {
    type: String,
    defualt:"not set"
  },
  accountHolderName: {
    type: String,
    defualt:"not set"
  },
  onlineStatus: {
    type: String
  },
  loginDevices: [loginDeviceSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  restaurantName: {
    type: String
  },
  email: {
    type: String,
    required: true,
  },
  logo: {
    type: String,
  },
  description: {
    type: String,
  },
  documentImageUrl: {
    type: String
  },
  documentStatus: {
    type: String,
    default:"In review"
  },
  documentExpiration: {
    type: Date
  },
  phoneNumber: {
    type: String
  },
  locationExist: {
    type: String
  },
  latitude: {
    type: String
  },
  longitude: {
    type: String
  },
  address: {
    type:String,
    defualt: "not set"
  },
  catelog: [],
  rating: {
    type: Number,
    default:0
  },
  ratingStar: {
    type: Number,
    default:0
  },
  ads: {
    type: Boolean,
    default: false
  },
  cpc: {
    type: Number,
    default: 0,
  },
  status: {
    type: String
  },
  location: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }
  },
  onlineStatus: {
    type: String,
    default:"offline"
  },
  selfDelivery: {
    type: String,
    default:"off"
  },
  balance: {
    type: Number,
    defualt:0
  },
  accountNumber: {
    type: String,
    defualt:"not set"
  },
  ifscCode: {
    type: String,
    defualt:"not set"
  },
  accountHolderName: {
    type: String,
    defualt:"not set"
  },
  loginDevices: [loginDeviceSchema], // Array of login devices
  linkIds: [linkingSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const requestSchema = new mongoose.Schema({
  requestSentBy: {
    type: String,
  },
  requestSentTo: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  userName: {
    type: String,
  },
  latitude: {
    type: String,
    required: true,
  },
  longitude: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const menuSchema = new mongoose.Schema({
  restaurantId: {
    type: String
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  restaurantName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  price: {
    type: String,
    required: true
  },
  comparePrice: {
    type: String,
  },
  latitude: {
    type: String,
    required: true,
  },
  longitude: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    default: 0,
  },
  ratingStar: {
    type: Number,
    default: 0,
  },
  ads: {
    type: Boolean,
    default: false
  },
  cpc: {
    type: Number,
    default: 0,
  },
  type: {
    type: String,
    required: true,
  },
  availableStatus: {
    type: String,
    default: "in stock",
  },
  status: {
    type: String,
    required: true,
  },
  location: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }
  },
  categories: [CategorySchema], // Add categories field
  additionalFields: { type: Schema.Types.Mixed, default: {} }, // Dynamic fields for menu items
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
  },
  title: [String],
  price: [String],
  comparePrice:[String],
  url: [String],
  description:[String],
  quantity:[String],
  type:[String],
  selectedVariant: [{
    items: String, // Array of objects with 'items' field as String
  }],
  restaurantEmail: {
    type: String,
    required: true,
  },
  restaurantAddress: {
    type:String,
    default:""
  },
  customerAddress: {
    type:String,
    default:""
  },
  restaurantId: {
    type: String,
    required: true,
  },
  customerEmail: {
    type: String,
    required: true,
  },
  customerId: {
    type: String,
    required: true,
  },
  deliveryEmail: {
    type: String,
    default: "yet to set",
  },
  deliveryPartnerId: {
    type: String,
    default: "yet to set",
  },
  restaurantLatitude: {
    type: Number,
    required: true,
  },
  restaurantLongitude: {
    type: Number,
    required: true,
  },
  customerLatitude: {
    type: Number,
    required: true,
  },
  customerLongitude: {
    type: Number,
    required: true,
  },
  customerNumber: {
    type: String,
    required: true,
  },
  restaurantNumber: {
    type: String,
    required: true,
  },
  deliveryNumber: {
    type: String,
    default: "yet to set",
  },
  restaurantName: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  deliveryName: {
    type: String,
    default: "yet to set",
  },
  deliveryProfile: {
    type: String,
    default: "yet to set",
  },
  customerAddress: {
    type:String,
    default:""
  },
  restaurantAddress: {
    type:String,
    defualt:""
  },
  gst: {
    type: String,
    required: true,
  },
  deliveryFees: {
    type: String,
    required: true,
  },
  restaurantOtp:{
    type: String,
    default: "yet to set",
  },
  customerOtp:{
    type: String,
    default: "yet to set",
  },
  review: {
    type: String,
    default: "yet to set",
  },
  starRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  }, 
  status: {
    type: String,
    default: "ordered",
  },
  cancelBy: {
    type: String,
    default:"not cancel"
  },
  orderTransfered: {
    type: Number,
    default: 0,
  },
  reasonOfCancel: {
    type: String,
    default: "not set",
  },
  numemberOfCustomerOrder: {
    type: Number,
    default: 0,
  },
  assignStatus: {
    type: String,
    default:"yet to assign"
  },
  paymentStatus: {
    type:String,
    default:"unpaid"
  },
  billingStatus: {
    type: String,
    default: "unpaid",
  },
  assignAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
},{ strict: false });

const ratingSchema = new mongoose.Schema({
  menuId: {
    type: String,
    required: true,
  },
  restaurantId: {
    type: String,
    required: true,
  },
  customerId: {
    type: String,
    required: true,
  },
  starRating: {
    type: Number,
    required: true,
  },
  comment: {
    type: String,
  },
  userEmail: {
    type: String,
    required: true,
  },
  profileImage: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Define the 2dsphere geospatial index on the location.coordinates field
menuSchema.index({ 'location.coordinates': '2dsphere' });

restaurantSchema.index({ 'location.coordinates': '2dsphere' });

deliverySchema.index({ 'location.coordinates': '2dsphere' });
// Define text index on the title, description, restaurantName, and type fields for text search
menuSchema.index({ title: 'text', description: 'text', restaurantName: 'text', type: 'text' });

const customer = mongoose.model("Customer", customerSchema);
const deliveryPartner = mongoose.model("DeliveryPartner", deliverySchema);
const restaurant = mongoose.model("Restaurant", restaurantSchema);
const menu = mongoose.model("Menu", menuSchema);
const order = mongoose.model("Order", orderSchema);
const rating = mongoose.model("Rating", ratingSchema);
const bugReport = mongoose.model("Bug", bugSchema);
const feedback = mongoose.model("Feedback", feedbackSchema);
const linkRequest = mongoose.model("Request", requestSchema);
module.exports = { customer,deliveryPartner,restaurant,menu,order,rating,bugReport,feedback,linkRequest };