'use strict'

let Service, Characteristic
const request = require('request').defaults({jar: true}) // Save cookies to maintain logged in state

module.exports = (homebridge) => {
  /* this is the starting point for the plugin where we register the accessory */
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-rika-firenet', 'RIKAFirenet', RIKAFirenetAccessory)
}

class RIKAFirenetAccessory {
  constructor (log, config) {
    /*
     * The constructor function is called when the plugin is registered.
     * log is a function that can be used to log output to the homebridge console
     * config is an object that contains the config for this plugin that was defined the homebridge config.json
     */

    /* assign both log and config to properties on 'this' class so we can use them in other methods */
    this.log = log
    this.config = config

    // Default values for testing, make sure they are unlikely
    this.Active = 0;
    this.CurrentHeaterCoolerState = 0;
    this.CurrentTemperature = 1;
    this.TargetHeaterCoolerState = 0; // This will always be auto, since cooling is not supported
    this.HeatingThresholdTemperature = 1;

    this.callbackQueue = [];
    this.latestUpdateTimestamp = 0;
    //this.loginToFirenet(this.updateStatus.bind(this));
    this.loginToFirenet();
    /*
     * Service types are defined in this code: https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js
     * Search for "* Service" to tab through each available service type.
     * Take note of the available "Required" and "Optional" Characteristics for the service you are creating
     */
    /*

      // Optional Characteristics
      Characteristic.LockPhysicalControls
      Characteristic.Name
      Characteristic.RotationSpeed
    */
    this.service = new Service.HeaterCooler(this.config.name)
  }

  getServices () {
    /*
     * The getServices function is called by Homebridge and should return an array of Services this accessory is exposing.
     * It is also where we bootstrap the plugin to tell Homebridge which function to use for which action.
     */

    /* Create a new information service. This just tells HomeKit about our accessory. */
    const informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'RIKA')
        .setCharacteristic(Characteristic.Model, 'Firenet')
        .setCharacteristic(Characteristic.SerialNumber, '0000000000')


    this.service.getCharacteristic(Characteristic.Active)
        .on('get', this.getCharacteristic.bind(this, "Active"))
        .on('set', this.setActiveCharacteristicHandler.bind(this))
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
        .on('get', this.getCharacteristic.bind(this, "CurrentHeaterCoolerState"))
        .props.maxValue = 2;
    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .on('get', this.getCharacteristic.bind(this, "TargetHeaterCoolerState"))
        .on('set', this.setTargetHeaterCoolerStateCharacteristicHandler.bind(this))
        .props.maxValue = 0; // Disable cooling, the stove will only ever heat
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCharacteristic.bind(this, "CurrentTemperature"))
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .on('get', this.getCharacteristic.bind(this, "HeatingThresholdTemperature"))
        .on('set', this.setHeatingThresholdTemperatureCharacteristicHandler.bind(this))
        .props.minValue = 14
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).props.maxValue = 28
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).props.minStep = 1
    /* Return both the main service (this.service) and the informationService */
    return [informationService, this.service]
  }



  /*Active.INACTIVE = 0;
  Active.ACTIVE = 1;*/
  setActiveCharacteristicHandler (value, callback) {
    this.Active = value;
    this.log(`calling setActiveCharacteristicHandler`, value);
    this.updateCharacteristic("onOff", (value === 1), callback);
  }

  setTargetHeaterCoolerStateCharacteristicHandler (value, callback) {
    // We'll keep this stub for now, even though it is useless
    this.TargetHeaterCoolerState = value
    this.log(`calling setTargetHeaterCoolerStateCharacteristicHandler`, value)
    callback(null)
  }

  setHeatingThresholdTemperatureCharacteristicHandler (value, callback) {
    this.HeatingThresholdTemperature = value;
    this.log(`calling setHeatingThresholdTemperatureCharacteristicHandler`, value);
    this.updateCharacteristic("targetTemperature", value, callback);
  }

  // RIKA specific code

  loginToFirenet (onSuccess) {
    this.log("Connecting to Firenet... ")
    request.post({url:'https://www.rika-firenet.com/web/login', form: {email:this.config.FirenetEmail, password:this.config.FirenetPassword}}, (error, response, body) => {
      if (body.indexOf("summary") > -1) {// login successful
        this.log("Connected to Firenet")
        this.connected = true;
        if (typeof onSuccess === "function") {
          onSuccess();
        }
      } else {
        this.log("Connecting to Firenet failed.")
        this.connected = false;
      }
    })
  }

  // Get current status from Firenet
  updateStatus () {
    if (this.currentlyUpdating === true) {
      return; // Let's get out of here
    } else {
      this.currentlyUpdating = true;
    }
    this.log("Updating Firenet status...")
    request.get({url:'https://www.rika-firenet.com/api/client/'+this.config.stoveID+'/status'}, (error, response, body) => {
      if (response.statusCode == 200 && body.indexOf(this.config.stoveID) > -1) {// request successful
        this.log("Status retrieved, processing...")
        var json = JSON.parse(body);

        this.Active = !(json.controls.statusMainState == 0 && json.controls.statusSubState == 1);
        this.HeatingThresholdTemperature = json.controls.targetTemperature;
        this.CurrentTemperature = json.sensors.inputRoomTemperature;
        if (json.sensors.statusMainState == 0 && json.sensors.statusSubState == 1) { // Stove inactive
          this.CurrentHeaterCoolerState = 0;
        } else if (json.sensors.statusMainState <= 5 && json.sensors.statusMainState >= 2) { // heating
          this.CurrentHeaterCoolerState = 2;
        } else { // idle
          this.CurrentHeaterCoolerState = 1;
        }
        this.revision = json.controls.revision; // Needed for sending values to the Firenet
        // Updating complete
        this.currentlyUpdating = false;
        this.latestUpdateTimestamp = Date.now();

        // Handle callbacks that are waiting in the queue
        var i = this.callbackQueue.length
        while (i--) {
          this.getCharacteristic(this.callbackQueue[i].characteristic, this.callbackQueue[i].callback)
          this.callbackQueue.splice(i, 1);
        }
        this.log("Callback queue processed")
      } else if (response.statusCode == 401) { // Logged out
        this.log("Updating status failed: login required")
        this.loginToFirenet(this.updateStatus.bind(this))
      } else if (response.statusCode == 500) { // Stove not linked to account or general server error
        this.log("Updating status failed: Firenet reported an Internal Server Error. Is the stove linked to this account?")
      }
    })
  }

  /*
   * Process get characteristic request fired by Homekit
   *
   * characteristic: name of the property to return
   * callback: callback function to call when the value is available
   */
  getCharacteristic(characteristic, callback) {
    if ((Date.now()-this.latestUpdateTimestamp) > 1000) { // No recent update
      this.log("getCharacteristic from server: " + characteristic, this[characteristic]);
      this.callbackQueue.push({callback: callback, characteristic: characteristic});
      this.updateStatus();
    } else { // Data is recent, return
      this.log("getCharacteristic from cache: " + characteristic, this[characteristic]);
      callback(null, this[characteristic]);
    }
  }

  /*
   * Send a changed characteristic to Firenet
   */
  updateCharacteristic(controlItem, value, callback) {
    request.get({url:'https://www.rika-firenet.com/api/client/'+this.config.stoveID+'/status'}, (error, response, body) => {
      if (response.statusCode == 200 && body.indexOf(this.config.stoveID) > -1) {// request successful
        var json = JSON.parse(body);
        json.controls[controlItem] = value;
        request.post({url:'https://www.rika-firenet.com/api/client/'+this.config.stoveID+"/controls", form: json.controls}, (error, response, body) => {
          if (response.statusCode == 200) {// Update successful
            this.log(controlItem + " set", value)
            callback(null)
          } else {
            this.log("Failed to update " + controlItem, body);
          }
        })
      } else if (response.statusCode == 401) { // Logged out
        this.log("Updating status failed: login required")
        this.loginToFirenet(this.updateStatus.bind(this))
      } else if (response.statusCode == 500) { // Stove not linked to account or general server error
        this.log("Updating status failed: Firenet reported an Internal Server Error. Is the stove linked to this account?")
      }
    })
  }








































}