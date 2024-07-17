const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const app = express();
const globalEnum = require("./enum.js");
// 首先配置results的文件夹路径
// 读取根目录下的config.yaml文件
const configPath = path.join(process.cwd(), "config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8"));
// 读取config下的server_path
const serverNameString = config.server_name;
const server_path = config.server_path;
const port = config.port;
const results_path = path.join(server_path, "results");
const filesLimit = config.files_limit || 10000;
const ejs = require('ejs');
const renderIndexString = fs.readFileSync(path.join(__dirname, 'views/index.ejs'), 'utf8');

// const assetsPath = path.join(__dirname, 'public');
// app.use(express.static(assetsPath));


app.get("/", (req, res) => {
  // res.send("Hello World!");
  // 需要读取results下的所有json文件
  // 使用同步读取
  let files = fs.readdirSync(results_path);
  // 这里循环读取所有的files
  const results = [];
  // 这里要对files里面的file进行排序，按照时间排序，只取前面1000个
  files.sort((a, b) => {
    // a和b是两个文件名, 240712_142723_Q.json
    // 240712_142723_Q
    const [date1, time1, session1] = a.split("_");
    const [date2, time2, session2] = b.split("_");
    // 20240712
    const date1Int = parseInt(date1);
    const date2Int = parseInt(date2);
    // 142723
    const time1Int = parseInt(time1);
    const time2Int = parseInt(time2);
    // 20240712
    if (date1Int < date2Int) {
      return 1;
    } else if (date1Int > date2Int) {
      return -1;
    } else {
      // 142723
      if (time1Int < time2Int) {
        return 1;
      } else if (time1Int > time2Int) {
        return -1;
      } else {
        // 142723
        return 0;
      }
    }
  });
  // 只取前1000个
  files = files.slice(0, filesLimit);
  files.forEach((file) => {
    // 如果file不是json文件，则跳过
    if (!file.endsWith(".json")) {
      return;
    }
    // 从file文件中解析出日期
    // 240712_142723_Q
    const [date, time, session] = file.split("_");
    const year = date.slice(0, 2);
    const month = date.slice(2, 4);
    const day = date.slice(4, 6);
    const hour = time.slice(0, 2);
    const minute = time.slice(2, 4);
    const second = time.slice(4, 6);
    const sessionType = session.slice(0, 1);
    // 读取文件内容
    var filePath = path.join(results_path, file);
    const contentBuffer = fs.readFileSync(filePath);
    let content = contentBuffer.toString('utf16le');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    const jsonObject = JSON.parse(content);

    // 先找出车的id
    let leaderBoardLines = jsonObject.sessionResult.leaderBoardLines
    leaderBoardLines = leaderBoardLines.map((line) => {
      return {
        carId: line.car.carId,
        carModel: line.car.carModel,
        currentDriverName: line.currentDriver.shortName,
        palyerId: line.currentDriver.playerId,
        playerFullName: line.currentDriver.firstName + "" + line.currentDriver.lastName,
      }
    });

    // laps
    let laps = jsonObject.laps;
    laps = laps.filter(n => n.isValidForBest)
    laps = laps.map((m) => {
      return {
        lapTimeString: formatLapTimeToString(m.laptime),
        playerFullName: leaderBoardLines.find(n => n.carId === m.carId).playerFullName,
        carName: globalEnum.cars[leaderBoardLines.find(n => n.carId === m.carId).carModel],
        carId: m.carId,
        driverName: leaderBoardLines.find(n => n.carId === m.carId).currentDriverName,
        playerId: leaderBoardLines.find(n => n.carId === m.carId).palyerId,
        laptime: m.laptime,
        splits: m.splits,
        sessionType: sessionType,
        dateTime: `20${year}-${month}-${day} ${hour}:${minute}:${second}`,
        track: jsonObject.trackName,
        splitsString: m.splits.map((split) => {
          return formatLapTimeToString(split);
        })
      }
    })
    laps = laps.sort((a, b) => {
      return a.laptime - b.laptime;
    });

    const personalBestLap = [];
    // 将这个laps的结果重组，只取每个人的最好成绩
    const personalBestLapMap = {};
    laps.forEach((lap) => {
      if (!personalBestLapMap[lap.playerId]) {
        personalBestLapMap[lap.playerId] = lap;
      } else {
        if (lap.laptime < personalBestLapMap[lap.playerId].laptime) {
          personalBestLapMap[lap.playerId] = lap;
        }
      }
    });
    for (const key in personalBestLapMap) {
      personalBestLap.push(personalBestLapMap[key]);
    }
    if (laps.length != 0) {
      results.push({
        dateTime: `20${year}-${month}-${day} ${hour}:${minute}:${second}`,
        laps: laps,
        track: jsonObject.trackName,
        personalBestLap: personalBestLap,
      });
    }
  });
  // 返回json数据
  // 这里要对results里面的lap进行排序
  // 首先根据track进行分组和合并
  const trackBestMap = {};
  const trackMap = {};
  results.forEach((result) => {
    if (!trackMap[result.track]) {
      trackMap[result.track] = [];
      trackBestMap[result.track] = [];
    }
    trackMap[result.track] = trackMap[result.track].concat(result.laps);
    // 然后对这个trackMap里面的lap进行排序
    trackMap[result.track] = trackMap[result.track].sort((a, b) => {
      return a.laptime - b.laptime;
    });
    // 然后把这个trackMap里面的lap进行重组，只取每个人的最好成绩
    const personalBestLapMap = {};
    trackMap[result.track].forEach((lap) => {
      if (!personalBestLapMap[lap.playerId]) {
        personalBestLapMap[lap.playerId] = lap;
      } else {
        if (lap.laptime < personalBestLapMap[lap.playerId].laptime) {
          personalBestLapMap[lap.playerId] = lap;
        }
      }
    });
    const personalBestLap = [];
    for (const key in personalBestLapMap) {
      personalBestLap.push(personalBestLapMap[key]);
    }
    trackMap[result.track] = trackMap[result.track];
    trackBestMap[result.track] = personalBestLap;
  });

  const rankList = []
  for (const key in trackMap) {
    rankList.push({
      track: key,
      personalBestLap: trackBestMap[key],
    });
  }

  // 我想要搞一个html模版，并且把数据渲染到html模版里面
  // 这里返回的数据是一个json数据
  // res.send({
  //   code: 0,
  //   results: results,
  //   trackMap: trackMap,
  //   data: rankList
  // });
  let render = ejs.render(renderIndexString, { data: rankList, serverName: serverNameString });
  res.send(render)
});

app.listen(port, () => {
  console.log("server is running on port", port);
});

function formatLapTimeToString (laptime) {
  // laptime is in milliseconds
  const milliseconds = laptime % 1000;
  // milliseconds不足三位的时候，前面补0
  const millisecondsString = milliseconds < 10 ? `00${milliseconds}` : milliseconds < 100 ? `0${milliseconds}` : `${milliseconds}`;
  const seconds = Math.floor(laptime / 1000) % 60;
  // seconds不足两位的时候，前面补0
  const secondsString = seconds < 10 ? `0${seconds}` : `${seconds}`;
  const minutes = Math.floor(laptime / 60000);
  return `${minutes}:${secondsString}.${millisecondsString}`;
}