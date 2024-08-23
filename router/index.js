// First, configure the path to the results folder
// Read the config.yaml file in the root directory
const express = require("express");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const process = require("process");
const pino = require("pino");
const pretty = require("pino-pretty");
const configPath = path.join(process.cwd(), "./config.yaml");
const config = yaml.load(fs.readFileSync(configPath, "utf8"));
// Read the server_path from the config
const serverNameString = config.server_name;
const server_path = config.server_path;
const port = config.port;
const results_path = path.join(server_path, "results");
const filesLimit = config.files_limit || 10000;
const logger = pino(pretty(
  {
    colorize: true,
    translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
  }
));
const globalEnum = require("../enum.js");
const router = express.Router();

router.get("/", (req, res) => {
  const countStartMs = new Date().getTime();
  const results = [];
  const files = readResultsFiles();
  const userLapCountsMap = {};
  const dateList = [];

  let startDate = req && req.query && req.query.startDate;
  let endDate = req && req.query && req.query.endDate;

  files.forEach((file) => {
    if (!file.endsWith(".json")) {
      return;
    }
    try {
      var [date, time, session] = file.split("_");
      var year = date.slice(0, 2);
      var month = date.slice(2, 4);
      var day = date.slice(4, 6);
      var hour = time.slice(0, 2);
      var minute = time.slice(2, 4);
      var second = time.slice(4, 6);
      var sessionType = session.split(".")[0];
    } catch (error) {
      return;
    }
    let thedate = {
      year: '20' + year,
      month,
      day
    }
    if (!dateList.find(n => n.year === thedate.year && n.month === thedate.month && n.day === thedate.day)) {
      dateList.push(thedate);
    }

    // Apply conditions to limit the data
    // First case: If both startDate and endDate exist, only show data within that time range
    let dateParseInt = parseInt('20'+year + month + day);
    let parseStartDate = startDate ? parseInt(startDate.split('-').join('')) : 0;
    let parseEndDate = endDate ? parseInt(endDate.split('-').join('')) : 0;
    if (!startDate) {
      startDate = 'all';
    }
    if (!endDate) {
      endDate = 'all';
    }
    // If both startDate and endDate exist
    if (startDate != 'all' && endDate != 'all') {
      if (dateParseInt < parseStartDate || dateParseInt > parseEndDate) {
        return;
      }
    }
    if (startDate != 'all' && endDate == 'all') {
      if (dateParseInt < parseStartDate) {
        return;
      }
    }
    if (startDate == 'all' && endDate != 'all') {
      if (dateParseInt > parseEndDate) {
        return;
      }
    }
    
    var { jsonObject } = readJsonFile(file);;
    if (!jsonObject.sessionResult || !jsonObject.laps || !jsonObject.sessionResult.leaderBoardLines) {
      return;
    }

    // find out the car ID, car model, and current driver
    let leaderBoardLines = jsonObject.sessionResult.leaderBoardLines;
    leaderBoardLines = leaderBoardLines.map((line) => {
      return {
        carId: line.car.carId,
        carModel: line.car.carModel,
        currentDriverName: line.currentDriver.shortName,
        palyerId: line.currentDriver.playerId,
        playerFullName:
          line.currentDriver.firstName + " " + line.currentDriver.lastName,
      };
    });

    let laps = jsonObject.laps;
    // Record the number of laps each driver has on this track
    laps.forEach((lap) => {
      let playerId = leaderBoardLines.find(
        (n) => n.carId === lap.carId
      ).palyerId;
      let track = jsonObject.trackName;
      if (!userLapCountsMap[playerId + "-" + track]) {
        userLapCountsMap[playerId + "-" + track] = 0;
      }
      userLapCountsMap[playerId + "-" + track] += 1;
    });
   
    laps = laps.filter((n) => n.isValidForBest);
    // add playerFullName, carName, carId, driverName, playerId to laps
    laps = laps.map((m) => {
      return {
        lapTimeString: formatLapTimeToString(m.laptime),
        playerFullName: leaderBoardLines.find((n) => n.carId === m.carId)
          .playerFullName,
        carName:
          globalEnum.cars[
            leaderBoardLines.find((n) => n.carId === m.carId).carModel
          ],
        carId: m.carId,
        driverName: leaderBoardLines.find((n) => n.carId === m.carId)
          .currentDriverName,
        playerId: leaderBoardLines.find((n) => n.carId === m.carId).palyerId,
        laptime: m.laptime,
        splits: m.splits,
        sessionType: sessionType,
        dateTime: `20${year}-${month}-${day} ${hour}:${minute}:${second}`,
        track: jsonObject.trackName,
        splitsString: m.splits.map((split) => {
          return formatLapTimeToString(split);
        }),
      };
    });
    laps = laps.sort((a, b) => {
      return a.laptime - b.laptime;
    });

    const personalBestLap = [];
    // Restructure the laps results, taking only the best performance of each driver
    const personalBestLapMap = {};
    laps.forEach((lap) => {
      if (!personalBestLapMap[lap.playerId]) {
        personalBestLapMap[lap.playerId] = lap;
      } else {
        if (lap.laptime < personalBestLapMap[lap.playerId].laptime) {
          personalBestLapMap[lap.playerId] = lap;
        }
      }
      personalBestLapMap[lap.playerId].lapCount =
        userLapCountsMap[lap.playerId + "-" + lap.track];
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
  // Sort the laps in the results array
  // First, group and merge by track
  const trackBestMap = {};
  const trackMap = {};
  results.forEach((result) => {
    if (!trackMap[result.track]) {
      trackMap[result.track] = [];
      trackBestMap[result.track] = [];
    }
    trackMap[result.track] = trackMap[result.track].concat(result.laps);
    trackMap[result.track] = trackMap[result.track].sort((a, b) => {
      return a.laptime - b.laptime;
    });
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

  // Sort the s1, s2, s3 times for each track result
  for (const key in trackBestMap) {
    const track = trackBestMap[key];
    let s1BestLap = 0;
    let s1BestIndex = -1;
    let s2BestLap = 0;
    let s2BestIndex = -1;
    let s3BestLap = 0;
    let s3BestIndex = -1;
    track.forEach((lap, index) => {
      if (!s1BestLap) {
        s1BestLap = lap.splits[0];
        s1BestIndex = index;
        track[index].s1Best = true;
      } else {
        if (lap.splits[0] < s1BestLap) {
          s1BestLap = lap.splits[0];
          track[s1BestIndex].s1Best = false;
          track[index].s1Best = true;
          s1BestIndex = index;
        }
      }
      if (!s2BestLap) {
        s2BestLap = lap.splits[1];
        s2BestIndex = index;
        track[index].s2Best = true;
      } else {
        if (lap.splits[1] < s2BestLap) {
          s2BestLap = lap.splits[1];
          track[s2BestIndex].s2Best = false;
          track[index].s2Best = true;
          s2BestIndex = index;
        }
      }
      if (!s3BestLap) {
        s3BestLap = lap.splits[2];
        s3BestIndex = index;
        track[index].s3Best = true;
      } else {
        if (lap.splits[2] < s3BestLap) {
          s3BestLap = lap.splits[2];
          track[s3BestIndex].s3Best = false;
          track[index].s3Best = true;
          s3BestIndex = index;
        }
      }
    });
  }
  const rankList = [];
  for (const key in trackMap) {
    rankList.push({
      track: key,
      personalBestLap: trackBestMap[key],
    });
  }
  // res.send(rankList);
  res.render("index", {
    data: rankList,
    dateList: dateList,
    serverName: serverNameString,
    filesLimit: filesLimit
  });
  logger.info(
    `get http://localhost:${port}/ ${new Date().getTime() - countStartMs}ms`
  );
});

router.get("/results/", (req, res) => {
  const countStartMs = new Date().getTime();
  const files = readResultsFiles();
  const results = [];
  files.forEach((file) => {
    if (!file.endsWith(".json")) {
      return;
    }
    try {
      var { dateTime, sessionType, jsonObject } = readJsonFile(file);
    } catch (error) {
      console.log(error);
      return;
    }
    if (!jsonObject || !jsonObject.sessionResult || !jsonObject.sessionResult.leaderBoardLines) {
      return;
    }
    let currentDriver = jsonObject.sessionResult.leaderBoardLines.map(
      (line, index) => {
        return {
          ...line.currentDriver,
          rank: index + 1,
          bestLap:
            line.timing.bestLap !== 2147483647
              ? formatLapTimeToString(line.timing.bestLap)
              : "--",
          bestSplits: line.timing.bestSplits,
          bestSplitsString: line.timing.bestSplits.map((split) => {
            return formatLapTimeToString(split);
          }),
          totalTime: formatLapTimeToString(line.timing.totalTime == 2147483647 ? 0 : line.timing.totalTime),
          totalTimeNumber: Math.floor(line.timing.totalTime == 2147483647 ? 0 : line.timing.totalTime),
          laps: line.timing.lapCount
        };
      }
    );
    if (currentDriver.length) {
      let first = currentDriver[0];
      let firstLaps = first.laps;
      let firstTotalTime = first.totalTimeNumber;
      currentDriver = currentDriver.map((driver) => {
        return {
          ...driver,
          gapTime:
            driver.laps == firstLaps
              ? "+" +
                formatLapTimeToString(driver.totalTimeNumber - firstTotalTime)
              : "+" + (firstLaps - driver.laps) + " Lap",
        };
      });
    }
    if (currentDriver.length) {
      results.push({
        dateTime: dateTime,
        sessionType: sessionType,
        trackName: jsonObject.trackName,
        currentDriver: currentDriver,
      });
    }
  });
  results.forEach((track) => {
    // Need to sort bestLap and bestSplitsString within the result
    let s1BestLap = 0;
    let s1BestIndex = -1;
    let s2BestLap = 0;
    let s2BestIndex = -1;
    let s3BestLap = 0;
    let s3BestIndex = -1;
    track.currentDriver.forEach((lap, index) => {
      if (!s1BestLap) {
        s1BestLap = lap.bestSplits[0];
        s1BestIndex = index;
        lap.s1Best = true;
      } else {
        if (lap.bestSplits[0] < s1BestLap) {
          s1BestLap = lap.bestSplits[0];
          track.currentDriver[s1BestIndex].s1Best = false;
          lap.s1Best = true;
          s1BestIndex = index;
        }
      }
      if (!s2BestLap) {
        s2BestLap = lap.bestSplits[1];
        s2BestIndex = index;
        lap.s2Best = true;
      } else {
        if (lap.bestSplits[1] < s2BestLap) {
          s2BestLap = lap.bestSplits[1];
          track.currentDriver[s2BestIndex].s2Best = false;
          lap.s2Best = true;
          s2BestIndex = index;
        }
      }
      if (!s3BestLap) {
        s3BestLap = lap.bestSplits[2];
        s3BestIndex = index;
        lap.s3Best = true;
      } else {
        if (lap.bestSplits[2] < s3BestLap) {
          s3BestLap = lap.bestSplits[2];
          track.currentDriver[s3BestIndex].s3Best = false;
          lap.s3Best = true;
          s3BestIndex = index;
        }
      }
    })
  });
  // res.send(results);
  res.render("results", {
    data: results,
    filesLimit: filesLimit,
    serverName: serverNameString,
  });
  logger.info(
    `get http://localhost:${port}/result ${new Date().getTime() - countStartMs}ms`
  );
});

function formatLapTimeToString(lapTimeFloor, isHour = false) {
  const laptime = Math.floor(lapTimeFloor);
  // laptime is in milliseconds
  const milliseconds = laptime % 1000;
  // milliseconds not less than 3 digits，then add 0
  const millisecondsString =
    milliseconds < 10
      ? `00${milliseconds}`
      : milliseconds < 100
      ? `0${milliseconds}`
      : `${milliseconds}`;
  const seconds = Math.floor(laptime / 1000) % 60;
  // seconds not less than 2 digits，then add 0
  const secondsString = seconds < 10 ? `0${seconds}` : `${seconds}`;
  if (!isHour) {
    const minutes = Math.floor(laptime / 60000);
    return `${minutes}:${secondsString}.${millisecondsString}`;
  } else {
    const minutes = Math.floor(laptime / 60000) % 60;
    const hours = Math.floor(laptime / 3600000);
    return `${hours}:${minutes}:${secondsString}.${millisecondsString}`;
  }
}

// 批量读取文件
function readResultsFiles() {
  let files = fs.readdirSync(results_path);
  // then to be sorted by time
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
  // 只取前xxx个
  files = files.slice(0, filesLimit);
  return files;
}

function readJsonFile(file) {
  const [date, time, session] = file.split("_");
  const year = date.slice(0, 2);
  const month = date.slice(2, 4);
  const day = date.slice(4, 6);
  const hour = time.slice(0, 2);
  const minute = time.slice(2, 4);
  const second = time.slice(4, 6);
  const sessionType = session.split(".")[0];
  var filePath = path.join(results_path, file);
  const contentBuffer = fs.readFileSync(filePath);
  let content = contentBuffer.toString("utf16le");
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  const jsonObject = JSON.parse(content);
  return {
    dateTime: `20${year}-${month}-${day} ${hour}:${minute}:${second}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
    sessionType: sessionType,
    jsonObject: jsonObject,
  };
}

module.exports = router;
