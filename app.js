const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const app = express();
const pino = require('pino');
const pretty = require('pino-pretty');
const process = require('process');
const https = require('https');

let publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
let viewsPath = path.join(__dirname, 'views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');
const router = require('./router/index.js');
app.use('/', router);

const configPath = path.join(process.cwd(), "./config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8"));

const server_path = config.server_path;
const results_path = path.join(server_path, "results");
const http = require('http');
const chokidar = require('chokidar');

const port = config.port;
const logger = pino(pretty(
  {
    colorize: true,
    translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
  }
));

app.listen(port, () => {
  logger.info("server is running http://localhost:" + port);
  let initialScanDone = false;

  const watcher = chokidar.watch(results_path, {
    ignored: /(^|[\/\\])\../,
    persistent: true
  });
  
  watcher.on('ready', () => {
    initialScanDone = true;
  });

  watcher.on('all', (event, filePath) => {
    if (!initialScanDone) {
      return;
    }
    logger.info(`File change detected: ${event} ${filePath}`);
    http.get('http://127.0.0.1:' + port);
  });
});


