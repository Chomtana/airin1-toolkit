require("dotenv").config(__dirname + "/.env");
const fs = require("fs");
const path = require('path');
const express = require("express");
const axiosRaw = require("axios");
const app = express();
const port = 3000;

const util = require("util");
const exec = util.promisify(require("child_process").exec);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const axios = axiosRaw.create({ timeout: 4000 });
const axiosNodeRed = axiosRaw.create({
  baseURL: "http://127.0.0.1:1880",
  timeout: 4000,
});
const axiosLocaltunnel = axiosRaw.create({
  baseURL: "http://lt.airin1.com",
  timeout: 4000,
});
const axiosAirin1 = axiosRaw.create({
  baseURL: "https://api.airin1.com",
  timeout: 4000,
  headers: {
    Authorization: "Bearer " + process.env.ADVANCE_TOKEN,
  },
});

app.use(express.json());

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.post("/api/localtunnel/subdomain/:subdomain", async (req, res) => {
  const { stdout, stderr } = await exec(
    __dirname + "/localtunnel.sh " + req.params.subdomain
  );
  res.send({ stdout, stderr });
});

app.post("/api/fixport/:port", async (req, res) => {
  const { stdout, stderr } = await exec(
    __dirname + "/fixport.sh " + req.params.port
  );
  res.send({ stdout, stderr });
});

async function readInputRegisterNodeRed(modbusId, regad, len, retryCount = 0) {
  try {
    let response = await axiosNodeRed.get("/modbus/" + modbusId + "/read", {
      params: {
        regad,
        len,
      },
    });

    return response.data;
  } catch (err) {
    // console.error(err.response);
    await wait(1000);
    if (retryCount < 3) {
      return await readInputRegisterNodeRed(
        modbusId,
        regad,
        len,
        retryCount + 1
      );
    } else {
      throw err;
    }
  }
}

async function getAvailableFCU(modbusId) {
  try {
    let result = [];
    let blocksAvailableRaw = await readInputRegisterNodeRed(modbusId, 1, 10);

    for (let i = 0; i < blocksAvailableRaw.length; i++) {
      for (let j = 0; j < 16; j++) {
        // console.log("RAW", blocksAvailableRaw);

        if (blocksAvailableRaw[i] & (1 << j)) {
          result.push(16 * i + j);
        }
      }
    }

    return result;
  } catch (err) {
    console.error(err);
    return [];
  }
}

app.get("/api/modbus/:modbusId", async (req, res) => {
  res.send(await getAvailableFCU(req.params.modbusId));
});

app.post("/api/airin1/devices", async (req, res) => {
  try {
    const fcuList = await getAvailableFCU(req.params.modbusId);
    const buildingResponse = await axiosAirin1.get("/api/buildings/" + req.params.buildingId);
  
    const subdomain = fs.readFileSync("../localtunnel-healthcheck/subdomain", "utf-8");
  
    for (let fcu of fcuList) {
      await axiosAirin1.post(
        "/api/devices",
        {
          activePage: "insurance",
          activePages: [
            "building_type",
            "building",
            "split_type_1",
            "advance_info",
            "insurance",
          ],
          building: buildingResponse.data,
          device: {
            device_detail: {
              name: req.body.prefix + " " + (Math.floor(fcu / 16) + 1) + "-" + (fcu % 16),
              avatar: "/img/graphics/air.png",
              device_type_id: 1,
              position: {
                top: 0.4,
                left: 0.4,
                width: 0.2,
                height: 0.2,
              },
            },
            device_control_air: {
              device_iot_id: `http/${subdomain}.lt.airin1.com:${req.params.modbusId}/${fcu}`,
              device_air_brand_id: 1,
              device_air_type_id: 2,
              device_wifi_ssid: "",
              device_wifi_password: "",
              device_air_productcode: "",
              device_air_product_generation: "",
              device_air_upgrade_version: 0,
              device_air_version: 0,
              technician: {
                name: "",
                phone: "",
                address: "",
                under_shop_name: "",
              },
              device_mqtt_hostname: "mqtt.airin1.com",
              device_mqtt_port: 1883,
              device_mqtt_username: "airin1",
              device_mqtt_password: "Aaairin0ne*",
              device_air_buy_form: "",
              delivery_date: "2022-05-30T03:19:49.047Z",
              warranty_all_part_month: null,
              warranty_compressor_month: null,
              warranty_installation_month: null,
              device_linked_id: 0,
            },
          },
        },
      );
    }
  
    res.send(fcuList);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/api/localtunnel/host", async (req, res) => {
  try {
    const subdomain = fs.readFileSync("../localtunnel-healthcheck/subdomain", "utf-8");
    res.send({ subdomain });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/api/localtunnel/port", async (req, res) => {
  try {
    const subdomain = fs.readFileSync("../localtunnel-healthcheck/subdomain", "utf-8");
    let response = await axiosLocaltunnel.get("/api/fixport/" + subdomain);
    res.send(response.data);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/api/localtunnel/ping", async (req, res) => {
  try {
    const subdomain = fs.readFileSync("../localtunnel-healthcheck/subdomain", "utf-8");
    console.log(subdomain);
    await axios.get(`http://${subdomain}.lt.airin1.com/healthcheck`);
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.sendStatus(400);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
