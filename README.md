<!-- markdownlint-disable MD033 -->

# homebridge-rika-firenet

Plugin for controlling RIKA Firenet enabled stoves via [Homebridge](https://github.com/nfarina/homebridge). It currently only supports the stove's "Comfort mode". In this mode, you control the stove as if it were a thermostat.

## Models Supported

All models that have a RIKA Firenet module installed.

Tested models:
- RIKA Livo Pellet stove

If you have another model working please let me know so I can add it here.

## Homekit

Supported Characteristics:
- Active
- TargetHeaterCoolerState
- CurrentHeaterCoolerState
- HeatingThresholdTemperature

## Installation

1. Install Homebridge using: `npm install -g homebridge` or `sudo npm install -g --unsafe-perm homebridge` ([more details](https://github.com/nfarina/homebridge#installation))
2. Install this plugin using: `npm install -g homebridge-rika-firenet`
3. Update your configuration file. See the sample below.

## Updating

- `npm update -g homebridge-rika-firenet`

## Configuration

### Sample Configuration

The Stove ID can be obtained by visiting the rika-firenet.com control panel. It is part of the URL.

Example: https://www.rika-firenet.com/web/stove/12345678

```js
"accessory": [{
  "platform": "RIKAFirenet",
  "name": "My Stove",
  "FirenetEmail": "my@email.address",
  "FirenetPassword": "myPassword",
  "stoveID": "1234567"
}]
```

### Accessory Names

Note the name in Homebridge/HomeKit may be out of sync from the Firenet portal. This is a [Homebridge/HomeKit limitation](https://github.com/nfarina/homebridge#limitations). You can rename your accessory through the Home app.