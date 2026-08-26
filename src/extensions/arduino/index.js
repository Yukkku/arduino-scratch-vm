import { Firmata, WebSerialTransport } from "firmata-web";

import ArgumentType from "../../extension-support/argument-type";
import BlockType from "../../extension-support/block-type";
import Cast from "../../util/cast";

const baudRate = 57600;

class Arduino {
  #runtime;
  #extensionId;
  #availablePorts = [];
  #firmata = null;
  #analogCache = new Map();
  #digitalCache = new Map();

  constructor(runtime, extensionId) {
    this.#runtime = runtime;
    this.#extensionId = extensionId;
    runtime.registerPeripheralExtension(extensionId, this);
  }

  async scan() {
    const ports = await navigator.serial.getPorts();
    this.#availablePorts = ports;
    this.#runtime.emit(
      this.#runtime.constructor.PERIPHERAL_LIST_UPDATE,
      this.#availablePorts.map((port, i) => {
        const info = port.getInfo();
        let name = "Unknown Device";
        if (info.usbVendorId === 0x2341 && info.usbProductId === 0x003E) {
          name = "Arduino Due";
        }
        if (info.usbVendorId === 0x2341 && info.usbProductId === 0x8036) {
          name = "Arduino Leonardo";
        }
        if (info.usbVendorId === 0x2341 && info.usbProductId === 0x0001) {
          name = "Arduino Uno";
        }
        if (info.usbVendorId === 0x2341 && info.usbProductId === 0x0043) {
          name = "Arduino Uno R3";
        }
        return {
          name,
          peripheralId: i,
          port,
        };
      }),
    );
  }
  async connect(id) {
    const port = this.#availablePorts[id];
    await port.open({ baudRate });
    const transport = new WebSerialTransport(port);
    const board = new Firmata(transport);

    board.on("ready", () => {
      console.log(board);
      this.#firmata = board;
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_CONNECTED);
      this.#setup();
    });

    board.on("close", () => {
      this.#firmata = null;
      this.#analogCache = new Map();
      this.#digitalCache = new Map();
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_DISCONNECTED);
      this.#runtime.emit(this.#runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
        message: `Scratch lost connection to`,
        extensionId: this.#extensionId
      });
    });
  }
  disconnect() {
    this.#firmata = null;
    this.#analogCache = new Map();
    this.#digitalCache = new Map();
  }
  isConnected() {
    return this.#firmata != null;
  }

  #setup() {
    for (const pin of this.analogPins()) {
      this.#firmata.analogRead(pin, val => {
        this.#analogCache.set(pin, val / this.#firmata.RESOLUTION.ADC);
      });
    }
    for (const pin of this.digitalInPins()) {
      this.#firmata.pinMode(pin, this.#firmata.MODES.INPUT);
      this.#firmata.digitalRead(pin, val => {
        this.#digitalCache.set(pin, val);
      });
    }
  }

  analogPins() {
    if (this.#firmata == null) return [];
    return Object.values(this.#firmata.analogPinLookup);
  }
  digitalInOutPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.INPUT)
          && pin.supportedModes.includes(MODES.OUTPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(Number(id));
    }
    return r;
  }
  digitalInPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.INPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(Number(id));
    }
    return r;
  }
  digitalOutPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.OUTPUT)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(Number(id));
    }
    return r;
  }
  digitalPwmPins() {
    if (this.#firmata == null) return [];
    const { MODES } = this.#firmata;
    const r = [];
    for (const id in this.#firmata.pins) {
      const pin = this.#firmata.pins[id];
      if (pin.supportedModes.includes(MODES.OUTPUT)
          && pin.supportedModes.includes(MODES.PWM)
          && !pin.supportedModes.includes(MODES.ANALOG)) r.push(Number(id));
    }
    return r;
  }

  setInputMode(pin) {
    this.#firmata.pinMode(pin, this.#firmata.MODES.INPUT);
  }
  setOutputMode(pin) {
    this.#firmata.pinMode(pin, this.#firmata.MODES.OUTPUT);
    this.#digitalCache.delete(pin);
  }

  analogRead(pin) {
    if (this.#firmata == null) return null;
    return this.#analogCache.get(pin);
  }
  digitalRead(pin) {
    if (this.#firmata == null) return null;
    return this.#digitalCache.get(pin);
  }
  digitalWrite(pin, value) {
    if (this.#firmata == null) return;
    if (this.#firmata.pins[pin]?.mode === this.#firmata.MODES.INPUT) return;
    if (!this.#firmata.pins[pin]?.supportedModes.includes(this.#firmata.MODES.OUTPUT)) return;
    this.#firmata.pinMode(pin, this.#firmata.MODES.OUTPUT);
    this.#firmata.digitalWrite(pin, value ? 1 : 0);
  }
  pwmWrite(pin, value) {
    if (this.#firmata == null) return;
    if (this.#firmata.pins[pin]?.mode === this.#firmata.MODES.INPUT) return;
    if (!this.#firmata.pins[pin]?.supportedModes.includes(this.#firmata.MODES.PWM)) return;
    this.#firmata.pinMode(pin, this.#firmata.MODES.PWM);
    this.#firmata.pwmWrite(pin, Math.round(value * this.#firmata.RESOLUTION.PWM));
  }
}

class ArduinoBlocks {
  #runtime;
  #peripheral;

  constructor(runtime) {
    this.#runtime = runtime;
    this.#peripheral = new Arduino(runtime, "arduino");
  }

  getInfo() {
    return {
      id: "arduino",
      name: "Arduino",
      showStatusButton: true,
      blocks: [
        {
          opcode: "setMode",
          text: "[PIN]ピンを[MODE]モードにする",
          blockType: BlockType.COMMAND,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalInOutPins",
            },
            MODE: {
              type: ArgumentType.STRING,
              menu: "modes",
            },
          },
        },
        {
          opcode: "analogRead",
          text: "A[PIN]",
          blockType: BlockType.REPORTER,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "analogPins",
            },
          },
        },
        {
          opcode: "digitalRead",
          text: "D[PIN]",
          blockType: BlockType.BOOLEAN,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalInPins",
            },
          },
        },
        {
          opcode: "digitalWrite",
          text: "[PIN]ピンから[VALUE]をデジタル出力",
          blockType: BlockType.COMMAND,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalOutPins",
            },
            VALUE: {
              type: ArgumentType.STRING,
              menu: "zeroone",
            },
          },
        },
        {
          opcode: "pwmWrite",
          text: "[PIN]ピンから[VALUE]をPWM出力",
          blockType: BlockType.COMMAND,
          arguments: {
            PIN: {
              type: ArgumentType.STRING,
              menu: "digitalPwmPins",
            },
            VALUE: {
              type: ArgumentType.STRING,
              defaultValue: "50",
            },
          },
        },
      ],
      menus: {
        modes: {
          acceptReporters: false,
          items: [
            { text: "入力", value: "INPUT" },
            { text: "出力", value: "OUTPUT" },
          ],
        },
        analogPins: {
          acceptReporters: false,
          items: "analogPinsMenu",
        },
        digitalInOutPins: {
          acceptReporters: false,
          items: "digitalInOutPinsMenu",
        },
        digitalInPins: {
          acceptReporters: false,
          items: "digitalInPinsMenu",
        },
        digitalOutPins: {
          acceptReporters: false,
          items: "digitalOutPinsMenu",
        },
        digitalPwmPins: {
          acceptReporters: false,
          items: "digitalPwmPinsMenu",
        },
        zeroone: {
          acceptReporters: true,
          items: ["0", "1"],
        },
      },
    };
  }

  analogPinsMenu() {
    const r = this.#peripheral.analogPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalInOutPinsMenu() {
    const r = this.#peripheral.digitalInOutPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalInPinsMenu() {
    const r = this.#peripheral.digitalInPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalOutPinsMenu() {
    const r = this.#peripheral.digitalOutPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }
  digitalPwmPinsMenu() {
    const r = this.#peripheral.digitalPwmPins().map(String);
    if (r.length === 0) r.push("");
    return r;
  }

  setMode({ PIN, MODE }) {
    const pin = Cast.toNumber(PIN);
    if (MODE === "INPUT") this.#peripheral.setInputMode(pin);
    if (MODE === "OUTPUT") this.#peripheral.setOutputMode(pin);
  }
  analogRead({ PIN }) {
    const pin = Cast.toNumber(PIN);
    return Math.round((this.#peripheral.analogRead(pin) ?? 0) * 1000) / 10;
  }
  digitalRead({ PIN }) {
    const pin = Cast.toNumber(PIN);
    return Boolean(this.#peripheral.digitalRead(pin) ?? 0);
  }
  digitalWrite({ PIN, VALUE }) {
    const pin = Cast.toNumber(PIN);
    const value = Cast.toBoolean(VALUE);
    this.#peripheral.digitalWrite(pin, value);
  }
  pwmWrite({ PIN, VALUE }) {
    const pin = Cast.toNumber(PIN);
    const value = Math.min(1, Math.max(0, Cast.toNumber(VALUE) / 100));
    this.#peripheral.pwmWrite(pin, value);
  }
}

export default ArduinoBlocks;
