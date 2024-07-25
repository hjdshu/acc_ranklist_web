const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const app = express();
const pino = require('pino');
const pretty = require('pino-pretty');
const process = require('process');
// 获取资源文件的路径
let publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
let viewsPath = path.join(__dirname, 'views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');
const router = require('./router/index.js');
app.use('/', router);

// 首先配置results的文件夹路径
// 读取根目录下的config.yaml文件
const configPath = path.join(process.cwd(), "./config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8"));
const port = config.port;
const logger = pino(pretty());

app.listen(port, () => {
  logger.info("server is running on port: " + port);
});


