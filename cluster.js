// cluster.js
const cluster = require('cluster');
const os = require('os');
const totalCpus = os.cpus().length;

if (cluster.isPrimary) {
  // Fork workers for each CPU core
  for (let i = 0; i < totalCpus; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Fork a new worker when one dies
  });
} else {
  // Require the main app file to start the server in worker processes
  require('./app');
}
