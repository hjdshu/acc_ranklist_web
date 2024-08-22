const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const app = express();
const pino = require('pino');
const pretty = require('pino-pretty');
const process = require('process');

let publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
let viewsPath = path.join(__dirname, 'views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');
const router = require('./router/index.js');
app.use('/', router);

const configPath = path.join(process.cwd(), "./config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8"));
const port = config.port;
const logger = pino(pretty(
  {
    colorize: true,
    translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
  }
));

app.listen(port, () => {
  logger.info("server is running on port: " + port);
});


