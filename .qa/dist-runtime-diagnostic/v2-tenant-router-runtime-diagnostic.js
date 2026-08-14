var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node-built-in-modules:events
import libDefault from "events";
var require_events = __commonJS({
  "node-built-in-modules:events"(exports, module) {
    module.exports = libDefault;
  }
});

// ../node_modules/pg-types/node_modules/postgres-array/index.js
var require_postgres_array = __commonJS({
  "../node_modules/pg-types/node_modules/postgres-array/index.js"(exports) {
    "use strict";
    exports.parse = function(source, transform) {
      return new ArrayParser(source, transform).parse();
    };
    var ArrayParser = class _ArrayParser {
      static {
        __name(this, "ArrayParser");
      }
      constructor(source, transform) {
        this.source = source;
        this.transform = transform || identity;
        this.position = 0;
        this.entries = [];
        this.recorded = [];
        this.dimension = 0;
      }
      isEof() {
        return this.position >= this.source.length;
      }
      nextCharacter() {
        var character = this.source[this.position++];
        if (character === "\\") {
          return {
            value: this.source[this.position++],
            escaped: true
          };
        }
        return {
          value: character,
          escaped: false
        };
      }
      record(character) {
        this.recorded.push(character);
      }
      newEntry(includeEmpty) {
        var entry;
        if (this.recorded.length > 0 || includeEmpty) {
          entry = this.recorded.join("");
          if (entry === "NULL" && !includeEmpty) {
            entry = null;
          }
          if (entry !== null) entry = this.transform(entry);
          this.entries.push(entry);
          this.recorded = [];
        }
      }
      consumeDimensions() {
        if (this.source[0] === "[") {
          while (!this.isEof()) {
            var char = this.nextCharacter();
            if (char.value === "=") break;
          }
        }
      }
      parse(nested) {
        var character, parser, quote;
        this.consumeDimensions();
        while (!this.isEof()) {
          character = this.nextCharacter();
          if (character.value === "{" && !quote) {
            this.dimension++;
            if (this.dimension > 1) {
              parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform);
              this.entries.push(parser.parse(true));
              this.position += parser.position - 2;
            }
          } else if (character.value === "}" && !quote) {
            this.dimension--;
            if (!this.dimension) {
              this.newEntry();
              if (nested) return this.entries;
            }
          } else if (character.value === '"' && !character.escaped) {
            if (quote) this.newEntry(true);
            quote = !quote;
          } else if (character.value === "," && !quote) {
            this.newEntry();
          } else {
            this.record(character.value);
          }
        }
        if (this.dimension !== 0) {
          throw new Error("array dimension not balanced");
        }
        return this.entries;
      }
    };
    function identity(value) {
      return value;
    }
    __name(identity, "identity");
  }
});

// ../node_modules/pg-types/lib/arrayParser.js
var require_arrayParser = __commonJS({
  "../node_modules/pg-types/lib/arrayParser.js"(exports, module) {
    var array = require_postgres_array();
    module.exports = {
      create: /* @__PURE__ */ __name(function(source, transform) {
        return {
          parse: /* @__PURE__ */ __name(function() {
            return array.parse(source, transform);
          }, "parse")
        };
      }, "create")
    };
  }
});

// ../node_modules/postgres-date/index.js
var require_postgres_date = __commonJS({
  "../node_modules/postgres-date/index.js"(exports, module) {
    "use strict";
    var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/;
    var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/;
    var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
    var INFINITY = /^-?infinity$/;
    module.exports = /* @__PURE__ */ __name(function parseDate(isoDate) {
      if (INFINITY.test(isoDate)) {
        return Number(isoDate.replace("i", "I"));
      }
      var matches = DATE_TIME.exec(isoDate);
      if (!matches) {
        return getDate(isoDate) || null;
      }
      var isBC = !!matches[8];
      var year = parseInt(matches[1], 10);
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var hour = parseInt(matches[4], 10);
      var minute = parseInt(matches[5], 10);
      var second = parseInt(matches[6], 10);
      var ms = matches[7];
      ms = ms ? 1e3 * parseFloat(ms) : 0;
      var date;
      var offset = timeZoneOffset(isoDate);
      if (offset != null) {
        date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
        if (is0To99(year)) {
          date.setUTCFullYear(year);
        }
        if (offset !== 0) {
          date.setTime(date.getTime() - offset);
        }
      } else {
        date = new Date(year, month, day, hour, minute, second, ms);
        if (is0To99(year)) {
          date.setFullYear(year);
        }
      }
      return date;
    }, "parseDate");
    function getDate(isoDate) {
      var matches = DATE.exec(isoDate);
      if (!matches) {
        return;
      }
      var year = parseInt(matches[1], 10);
      var isBC = !!matches[4];
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var date = new Date(year, month, day);
      if (is0To99(year)) {
        date.setFullYear(year);
      }
      return date;
    }
    __name(getDate, "getDate");
    function timeZoneOffset(isoDate) {
      if (isoDate.endsWith("+00")) {
        return 0;
      }
      var zone = TIME_ZONE.exec(isoDate.split(" ")[1]);
      if (!zone) return;
      var type = zone[1];
      if (type === "Z") {
        return 0;
      }
      var sign = type === "-" ? -1 : 1;
      var offset = parseInt(zone[2], 10) * 3600 + parseInt(zone[3] || 0, 10) * 60 + parseInt(zone[4] || 0, 10);
      return offset * sign * 1e3;
    }
    __name(timeZoneOffset, "timeZoneOffset");
    function bcYearToNegativeYear(year) {
      return -(year - 1);
    }
    __name(bcYearToNegativeYear, "bcYearToNegativeYear");
    function is0To99(num) {
      return num >= 0 && num < 100;
    }
    __name(is0To99, "is0To99");
  }
});

// ../node_modules/xtend/mutable.js
var require_mutable = __commonJS({
  "../node_modules/xtend/mutable.js"(exports, module) {
    module.exports = extend;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function extend(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    }
    __name(extend, "extend");
  }
});

// ../node_modules/postgres-interval/index.js
var require_postgres_interval = __commonJS({
  "../node_modules/postgres-interval/index.js"(exports, module) {
    "use strict";
    var extend = require_mutable();
    module.exports = PostgresInterval;
    function PostgresInterval(raw2) {
      if (!(this instanceof PostgresInterval)) {
        return new PostgresInterval(raw2);
      }
      extend(this, parse(raw2));
    }
    __name(PostgresInterval, "PostgresInterval");
    var properties = ["seconds", "minutes", "hours", "days", "months", "years"];
    PostgresInterval.prototype.toPostgres = function() {
      var filtered = properties.filter(this.hasOwnProperty, this);
      if (this.milliseconds && filtered.indexOf("seconds") < 0) {
        filtered.push("seconds");
      }
      if (filtered.length === 0) return "0";
      return filtered.map(function(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "");
        }
        return value + " " + property;
      }, this).join(" ");
    };
    var propertiesISOEquivalent = {
      years: "Y",
      months: "M",
      days: "D",
      hours: "H",
      minutes: "M",
      seconds: "S"
    };
    var dateProperties = ["years", "months", "days"];
    var timeProperties = ["hours", "minutes", "seconds"];
    PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function() {
      var datePart = dateProperties.map(buildProperty, this).join("");
      var timePart = timeProperties.map(buildProperty, this).join("");
      return "P" + datePart + "T" + timePart;
      function buildProperty(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "");
        }
        return value + propertiesISOEquivalent[property];
      }
      __name(buildProperty, "buildProperty");
    };
    var NUMBER = "([+-]?\\d+)";
    var YEAR = NUMBER + "\\s+years?";
    var MONTH = NUMBER + "\\s+mons?";
    var DAY = NUMBER + "\\s+days?";
    var TIME = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?";
    var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function(regexString) {
      return "(" + regexString + ")?";
    }).join("\\s*"));
    var positions = {
      years: 2,
      months: 4,
      days: 6,
      hours: 9,
      minutes: 10,
      seconds: 11,
      milliseconds: 12
    };
    var negatives = ["hours", "minutes", "seconds", "milliseconds"];
    function parseMilliseconds(fraction) {
      var microseconds = fraction + "000000".slice(fraction.length);
      return parseInt(microseconds, 10) / 1e3;
    }
    __name(parseMilliseconds, "parseMilliseconds");
    function parse(interval) {
      if (!interval) return {};
      var matches = INTERVAL.exec(interval);
      var isNegative = matches[8] === "-";
      return Object.keys(positions).reduce(function(parsed, property) {
        var position = positions[property];
        var value = matches[position];
        if (!value) return parsed;
        value = property === "milliseconds" ? parseMilliseconds(value) : parseInt(value, 10);
        if (!value) return parsed;
        if (isNegative && ~negatives.indexOf(property)) {
          value *= -1;
        }
        parsed[property] = value;
        return parsed;
      }, {});
    }
    __name(parse, "parse");
  }
});

// ../node_modules/postgres-bytea/index.js
var require_postgres_bytea = __commonJS({
  "../node_modules/postgres-bytea/index.js"(exports, module) {
    "use strict";
    var bufferFrom = Buffer.from || Buffer;
    module.exports = /* @__PURE__ */ __name(function parseBytea(input) {
      if (/^\\x/.test(input)) {
        return bufferFrom(input.substr(2), "hex");
      }
      var output = "";
      var i = 0;
      while (i < input.length) {
        if (input[i] !== "\\") {
          output += input[i];
          ++i;
        } else {
          if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
            output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8));
            i += 4;
          } else {
            var backslashes = 1;
            while (i + backslashes < input.length && input[i + backslashes] === "\\") {
              backslashes++;
            }
            for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
              output += "\\";
            }
            i += Math.floor(backslashes / 2) * 2;
          }
        }
      }
      return bufferFrom(output, "binary");
    }, "parseBytea");
  }
});

// ../node_modules/pg-types/lib/textParsers.js
var require_textParsers = __commonJS({
  "../node_modules/pg-types/lib/textParsers.js"(exports, module) {
    var array = require_postgres_array();
    var arrayParser = require_arrayParser();
    var parseDate = require_postgres_date();
    var parseInterval = require_postgres_interval();
    var parseByteA = require_postgres_bytea();
    function allowNull(fn) {
      return /* @__PURE__ */ __name(function nullAllowed(value) {
        if (value === null) return value;
        return fn(value);
      }, "nullAllowed");
    }
    __name(allowNull, "allowNull");
    function parseBool(value) {
      if (value === null) return value;
      return value === "TRUE" || value === "t" || value === "true" || value === "y" || value === "yes" || value === "on" || value === "1";
    }
    __name(parseBool, "parseBool");
    function parseBoolArray(value) {
      if (!value) return null;
      return array.parse(value, parseBool);
    }
    __name(parseBoolArray, "parseBoolArray");
    function parseBaseTenInt(string) {
      return parseInt(string, 10);
    }
    __name(parseBaseTenInt, "parseBaseTenInt");
    function parseIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(parseBaseTenInt));
    }
    __name(parseIntegerArray, "parseIntegerArray");
    function parseBigIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(function(entry) {
        return parseBigInteger(entry).trim();
      }));
    }
    __name(parseBigIntegerArray, "parseBigIntegerArray");
    var parsePointArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parsePoint(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parsePointArray");
    var parseFloatArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseFloat(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseFloatArray");
    var parseStringArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value);
      return p.parse();
    }, "parseStringArray");
    var parseDateArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseDate(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseDateArray");
    var parseIntervalArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseInterval(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseIntervalArray");
    var parseByteAArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(parseByteA));
    }, "parseByteAArray");
    var parseInteger = /* @__PURE__ */ __name(function(value) {
      return parseInt(value, 10);
    }, "parseInteger");
    var parseBigInteger = /* @__PURE__ */ __name(function(value) {
      var valStr = String(value);
      if (/^\d+$/.test(valStr)) {
        return valStr;
      }
      return value;
    }, "parseBigInteger");
    var parseJsonArray = /* @__PURE__ */ __name(function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(JSON.parse));
    }, "parseJsonArray");
    var parsePoint = /* @__PURE__ */ __name(function(value) {
      if (value[0] !== "(") {
        return null;
      }
      value = value.substring(1, value.length - 1).split(",");
      return {
        x: parseFloat(value[0]),
        y: parseFloat(value[1])
      };
    }, "parsePoint");
    var parseCircle = /* @__PURE__ */ __name(function(value) {
      if (value[0] !== "<" && value[1] !== "(") {
        return null;
      }
      var point = "(";
      var radius = "";
      var pointParsed = false;
      for (var i = 2; i < value.length - 1; i++) {
        if (!pointParsed) {
          point += value[i];
        }
        if (value[i] === ")") {
          pointParsed = true;
          continue;
        } else if (!pointParsed) {
          continue;
        }
        if (value[i] === ",") {
          continue;
        }
        radius += value[i];
      }
      var result = parsePoint(point);
      result.radius = parseFloat(radius);
      return result;
    }, "parseCircle");
    var init2 = /* @__PURE__ */ __name(function(register) {
      register(20, parseBigInteger);
      register(21, parseInteger);
      register(23, parseInteger);
      register(26, parseInteger);
      register(700, parseFloat);
      register(701, parseFloat);
      register(16, parseBool);
      register(1082, parseDate);
      register(1114, parseDate);
      register(1184, parseDate);
      register(600, parsePoint);
      register(651, parseStringArray);
      register(718, parseCircle);
      register(1e3, parseBoolArray);
      register(1001, parseByteAArray);
      register(1005, parseIntegerArray);
      register(1007, parseIntegerArray);
      register(1028, parseIntegerArray);
      register(1016, parseBigIntegerArray);
      register(1017, parsePointArray);
      register(1021, parseFloatArray);
      register(1022, parseFloatArray);
      register(1231, parseFloatArray);
      register(1014, parseStringArray);
      register(1015, parseStringArray);
      register(1008, parseStringArray);
      register(1009, parseStringArray);
      register(1040, parseStringArray);
      register(1041, parseStringArray);
      register(1115, parseDateArray);
      register(1182, parseDateArray);
      register(1185, parseDateArray);
      register(1186, parseInterval);
      register(1187, parseIntervalArray);
      register(17, parseByteA);
      register(114, JSON.parse.bind(JSON));
      register(3802, JSON.parse.bind(JSON));
      register(199, parseJsonArray);
      register(3807, parseJsonArray);
      register(3907, parseStringArray);
      register(2951, parseStringArray);
      register(791, parseStringArray);
      register(1183, parseStringArray);
      register(1270, parseStringArray);
    }, "init");
    module.exports = {
      init: init2
    };
  }
});

// ../node_modules/pg-int8/index.js
var require_pg_int8 = __commonJS({
  "../node_modules/pg-int8/index.js"(exports, module) {
    "use strict";
    var BASE = 1e6;
    function readInt8(buffer) {
      var high = buffer.readInt32BE(0);
      var low = buffer.readUInt32BE(4);
      var sign = "";
      if (high < 0) {
        high = ~high + (low === 0);
        low = ~low + 1 >>> 0;
        sign = "-";
      }
      var result = "";
      var carry;
      var t;
      var digits;
      var pad;
      var l;
      var i;
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        t = 4294967296 * carry + low;
        digits = "" + t % BASE;
        return sign + digits + result;
      }
    }
    __name(readInt8, "readInt8");
    module.exports = readInt8;
  }
});

// ../node_modules/pg-types/lib/binaryParsers.js
var require_binaryParsers = __commonJS({
  "../node_modules/pg-types/lib/binaryParsers.js"(exports, module) {
    var parseInt64 = require_pg_int8();
    var parseBits = /* @__PURE__ */ __name(function(data, bits, offset, invert, callback) {
      offset = offset || 0;
      invert = invert || false;
      callback = callback || function(lastValue, newValue, bits2) {
        return lastValue * Math.pow(2, bits2) + newValue;
      };
      var offsetBytes = offset >> 3;
      var inv = /* @__PURE__ */ __name(function(value) {
        if (invert) {
          return ~value & 255;
        }
        return value;
      }, "inv");
      var mask = 255;
      var firstBits = 8 - offset % 8;
      if (bits < firstBits) {
        mask = 255 << 8 - bits & 255;
        firstBits = bits;
      }
      if (offset) {
        mask = mask >> offset % 8;
      }
      var result = 0;
      if (offset % 8 + bits >= 8) {
        result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
      }
      var bytes = bits + offset >> 3;
      for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, inv(data[i]), 8);
      }
      var lastBits = (bits + offset) % 8;
      if (lastBits > 0) {
        result = callback(result, inv(data[bytes]) >> 8 - lastBits, lastBits);
      }
      return result;
    }, "parseBits");
    var parseFloatFromBits = /* @__PURE__ */ __name(function(data, precisionBits, exponentBits) {
      var bias = Math.pow(2, exponentBits - 1) - 1;
      var sign = parseBits(data, 1);
      var exponent = parseBits(data, exponentBits, 1);
      if (exponent === 0) {
        return 0;
      }
      var precisionBitsCounter = 1;
      var parsePrecisionBits = /* @__PURE__ */ __name(function(lastValue, newValue, bits) {
        if (lastValue === 0) {
          lastValue = 1;
        }
        for (var i = 1; i <= bits; i++) {
          precisionBitsCounter /= 2;
          if ((newValue & 1 << bits - i) > 0) {
            lastValue += precisionBitsCounter;
          }
        }
        return lastValue;
      }, "parsePrecisionBits");
      var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);
      if (exponent == Math.pow(2, exponentBits + 1) - 1) {
        if (mantissa === 0) {
          return sign === 0 ? Infinity : -Infinity;
        }
        return NaN;
      }
      return (sign === 0 ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
    }, "parseFloatFromBits");
    var parseInt16 = /* @__PURE__ */ __name(function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 15, 1, true) + 1);
      }
      return parseBits(value, 15, 1);
    }, "parseInt16");
    var parseInt32 = /* @__PURE__ */ __name(function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 31, 1, true) + 1);
      }
      return parseBits(value, 31, 1);
    }, "parseInt32");
    var parseFloat32 = /* @__PURE__ */ __name(function(value) {
      return parseFloatFromBits(value, 23, 8);
    }, "parseFloat32");
    var parseFloat64 = /* @__PURE__ */ __name(function(value) {
      return parseFloatFromBits(value, 52, 11);
    }, "parseFloat64");
    var parseNumeric = /* @__PURE__ */ __name(function(value) {
      var sign = parseBits(value, 16, 32);
      if (sign == 49152) {
        return NaN;
      }
      var weight = Math.pow(1e4, parseBits(value, 16, 16));
      var result = 0;
      var digits = [];
      var ndigits = parseBits(value, 16);
      for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + 16 * i) * weight;
        weight /= 1e4;
      }
      var scale = Math.pow(10, parseBits(value, 16, 48));
      return (sign === 0 ? 1 : -1) * Math.round(result * scale) / scale;
    }, "parseNumeric");
    var parseDate = /* @__PURE__ */ __name(function(isUTC, value) {
      var sign = parseBits(value, 1);
      var rawValue = parseBits(value, 63, 1);
      var result = new Date((sign === 0 ? 1 : -1) * rawValue / 1e3 + 9466848e5);
      if (!isUTC) {
        result.setTime(result.getTime() + result.getTimezoneOffset() * 6e4);
      }
      result.usec = rawValue % 1e3;
      result.getMicroSeconds = function() {
        return this.usec;
      };
      result.setMicroSeconds = function(value2) {
        this.usec = value2;
      };
      result.getUTCMicroSeconds = function() {
        return this.usec;
      };
      return result;
    }, "parseDate");
    var parseArray2 = /* @__PURE__ */ __name(function(value) {
      var dim2 = parseBits(value, 32);
      var flags = parseBits(value, 32, 32);
      var elementType = parseBits(value, 32, 64);
      var offset = 96;
      var dims = [];
      for (var i = 0; i < dim2; i++) {
        dims[i] = parseBits(value, 32, offset);
        offset += 32;
        offset += 32;
      }
      var parseElement = /* @__PURE__ */ __name(function(elementType2) {
        var length = parseBits(value, 32, offset);
        offset += 32;
        if (length == 4294967295) {
          return null;
        }
        var result;
        if (elementType2 == 23 || elementType2 == 20) {
          result = parseBits(value, length * 8, offset);
          offset += length * 8;
          return result;
        } else if (elementType2 == 25) {
          result = value.toString(this.encoding, offset >> 3, (offset += length << 3) >> 3);
          return result;
        } else {
          console.log("ERROR: ElementType not implemented: " + elementType2);
        }
      }, "parseElement");
      var parse = /* @__PURE__ */ __name(function(dimension, elementType2) {
        var array = [];
        var i2;
        if (dimension.length > 1) {
          var count = dimension.shift();
          for (i2 = 0; i2 < count; i2++) {
            array[i2] = parse(dimension, elementType2);
          }
          dimension.unshift(count);
        } else {
          for (i2 = 0; i2 < dimension[0]; i2++) {
            array[i2] = parseElement(elementType2);
          }
        }
        return array;
      }, "parse");
      return parse(dims, elementType);
    }, "parseArray");
    var parseText = /* @__PURE__ */ __name(function(value) {
      return value.toString("utf8");
    }, "parseText");
    var parseBool = /* @__PURE__ */ __name(function(value) {
      if (value === null) return null;
      return parseBits(value, 8) > 0;
    }, "parseBool");
    var init2 = /* @__PURE__ */ __name(function(register) {
      register(20, parseInt64);
      register(21, parseInt16);
      register(23, parseInt32);
      register(26, parseInt32);
      register(1700, parseNumeric);
      register(700, parseFloat32);
      register(701, parseFloat64);
      register(16, parseBool);
      register(1114, parseDate.bind(null, false));
      register(1184, parseDate.bind(null, true));
      register(1e3, parseArray2);
      register(1007, parseArray2);
      register(1016, parseArray2);
      register(1008, parseArray2);
      register(1009, parseArray2);
      register(25, parseText);
    }, "init");
    module.exports = {
      init: init2
    };
  }
});

// ../node_modules/pg-types/lib/builtins.js
var require_builtins = __commonJS({
  "../node_modules/pg-types/lib/builtins.js"(exports, module) {
    module.exports = {
      BOOL: 16,
      BYTEA: 17,
      CHAR: 18,
      INT8: 20,
      INT2: 21,
      INT4: 23,
      REGPROC: 24,
      TEXT: 25,
      OID: 26,
      TID: 27,
      XID: 28,
      CID: 29,
      JSON: 114,
      XML: 142,
      PG_NODE_TREE: 194,
      SMGR: 210,
      PATH: 602,
      POLYGON: 604,
      CIDR: 650,
      FLOAT4: 700,
      FLOAT8: 701,
      ABSTIME: 702,
      RELTIME: 703,
      TINTERVAL: 704,
      CIRCLE: 718,
      MACADDR8: 774,
      MONEY: 790,
      MACADDR: 829,
      INET: 869,
      ACLITEM: 1033,
      BPCHAR: 1042,
      VARCHAR: 1043,
      DATE: 1082,
      TIME: 1083,
      TIMESTAMP: 1114,
      TIMESTAMPTZ: 1184,
      INTERVAL: 1186,
      TIMETZ: 1266,
      BIT: 1560,
      VARBIT: 1562,
      NUMERIC: 1700,
      REFCURSOR: 1790,
      REGPROCEDURE: 2202,
      REGOPER: 2203,
      REGOPERATOR: 2204,
      REGCLASS: 2205,
      REGTYPE: 2206,
      UUID: 2950,
      TXID_SNAPSHOT: 2970,
      PG_LSN: 3220,
      PG_NDISTINCT: 3361,
      PG_DEPENDENCIES: 3402,
      TSVECTOR: 3614,
      TSQUERY: 3615,
      GTSVECTOR: 3642,
      REGCONFIG: 3734,
      REGDICTIONARY: 3769,
      JSONB: 3802,
      REGNAMESPACE: 4089,
      REGROLE: 4096
    };
  }
});

// ../node_modules/pg-types/index.js
var require_pg_types = __commonJS({
  "../node_modules/pg-types/index.js"(exports) {
    var textParsers = require_textParsers();
    var binaryParsers = require_binaryParsers();
    var arrayParser = require_arrayParser();
    var builtinTypes = require_builtins();
    exports.getTypeParser = getTypeParser2;
    exports.setTypeParser = setTypeParser;
    exports.arrayParser = arrayParser;
    exports.builtins = builtinTypes;
    var typeParsers = {
      text: {},
      binary: {}
    };
    function noParse(val) {
      return String(val);
    }
    __name(noParse, "noParse");
    function getTypeParser2(oid, format) {
      format = format || "text";
      if (!typeParsers[format]) {
        return noParse;
      }
      return typeParsers[format][oid] || noParse;
    }
    __name(getTypeParser2, "getTypeParser");
    function setTypeParser(oid, format, parseFn) {
      if (typeof format == "function") {
        parseFn = format;
        format = "text";
      }
      typeParsers[format][oid] = parseFn;
    }
    __name(setTypeParser, "setTypeParser");
    textParsers.init(function(oid, converter) {
      typeParsers.text[oid] = converter;
    });
    binaryParsers.init(function(oid, converter) {
      typeParsers.binary[oid] = converter;
    });
  }
});

// ../node_modules/pg/lib/defaults.js
var require_defaults = __commonJS({
  "../node_modules/pg/lib/defaults.js"(exports, module) {
    "use strict";
    module.exports = {
      // database host. defaults to localhost
      host: "localhost",
      // database user's name
      user: process.platform === "win32" ? process.env.USERNAME : process.env.USER,
      // name of database to connect
      database: void 0,
      // database user's password
      password: null,
      // a Postgres connection string to be used instead of setting individual connection items
      // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
      // in the defaults object.
      connectionString: void 0,
      // database port
      port: 5432,
      // number of rows to return at a time from a prepared statement's
      // portal. 0 will return all rows at once
      rows: 0,
      // binary result mode
      binary: false,
      // Connection pool options - see https://github.com/brianc/node-pg-pool
      // number of connections to use in connection pool
      // 0 will disable connection pooling
      max: 10,
      // max milliseconds a client can go unused before it is removed
      // from the pool and destroyed
      idleTimeoutMillis: 3e4,
      client_encoding: "",
      ssl: false,
      application_name: void 0,
      fallback_application_name: void 0,
      options: void 0,
      parseInputDatesAsUTC: false,
      // max milliseconds any query using this connection will execute for before timing out in error.
      // false=unlimited
      statement_timeout: false,
      // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
      // false=unlimited
      lock_timeout: false,
      // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
      // false=unlimited
      idle_in_transaction_session_timeout: false,
      // max milliseconds to wait for query to complete (client side)
      query_timeout: false,
      connect_timeout: 0,
      keepalives: 1,
      keepalives_idle: 0
    };
    var pgTypes = require_pg_types();
    var parseBigInteger = pgTypes.getTypeParser(20, "text");
    var parseBigIntegerArray = pgTypes.getTypeParser(1016, "text");
    module.exports.__defineSetter__("parseInt8", function(val) {
      pgTypes.setTypeParser(20, "text", val ? pgTypes.getTypeParser(23, "text") : parseBigInteger);
      pgTypes.setTypeParser(1016, "text", val ? pgTypes.getTypeParser(1007, "text") : parseBigIntegerArray);
    });
  }
});

// ../node_modules/pg/lib/utils.js
var require_utils = __commonJS({
  "../node_modules/pg/lib/utils.js"(exports, module) {
    "use strict";
    var defaults = require_defaults();
    function escapeElement(elementRepresentation) {
      var escaped = elementRepresentation.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return '"' + escaped + '"';
    }
    __name(escapeElement, "escapeElement");
    function arrayString(val) {
      var result = "{";
      for (var i = 0; i < val.length; i++) {
        if (i > 0) {
          result = result + ",";
        }
        if (val[i] === null || typeof val[i] === "undefined") {
          result = result + "NULL";
        } else if (Array.isArray(val[i])) {
          result = result + arrayString(val[i]);
        } else if (ArrayBuffer.isView(val[i])) {
          var item = val[i];
          if (!(item instanceof Buffer)) {
            var buf = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
            if (buf.length === item.byteLength) {
              item = buf;
            } else {
              item = buf.slice(item.byteOffset, item.byteOffset + item.byteLength);
            }
          }
          result += "\\\\x" + item.toString("hex");
        } else {
          result += escapeElement(prepareValue(val[i]));
        }
      }
      result = result + "}";
      return result;
    }
    __name(arrayString, "arrayString");
    var prepareValue = /* @__PURE__ */ __name(function(val, seen) {
      if (val == null) {
        return null;
      }
      if (val instanceof Buffer) {
        return val;
      }
      if (ArrayBuffer.isView(val)) {
        var buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength);
        if (buf.length === val.byteLength) {
          return buf;
        }
        return buf.slice(val.byteOffset, val.byteOffset + val.byteLength);
      }
      if (val instanceof Date) {
        if (defaults.parseInputDatesAsUTC) {
          return dateToStringUTC(val);
        } else {
          return dateToString(val);
        }
      }
      if (Array.isArray(val)) {
        return arrayString(val);
      }
      if (typeof val === "object") {
        return prepareObject(val, seen);
      }
      return val.toString();
    }, "prepareValue");
    function prepareObject(val, seen) {
      if (val && typeof val.toPostgres === "function") {
        seen = seen || [];
        if (seen.indexOf(val) !== -1) {
          throw new Error('circular reference detected while preparing "' + val + '" for query');
        }
        seen.push(val);
        return prepareValue(val.toPostgres(prepareValue), seen);
      }
      return JSON.stringify(val);
    }
    __name(prepareObject, "prepareObject");
    function pad(number, digits) {
      number = "" + number;
      while (number.length < digits) {
        number = "0" + number;
      }
      return number;
    }
    __name(pad, "pad");
    function dateToString(date) {
      var offset = -date.getTimezoneOffset();
      var year = date.getFullYear();
      var isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      var ret = pad(year, 4) + "-" + pad(date.getMonth() + 1, 2) + "-" + pad(date.getDate(), 2) + "T" + pad(date.getHours(), 2) + ":" + pad(date.getMinutes(), 2) + ":" + pad(date.getSeconds(), 2) + "." + pad(date.getMilliseconds(), 3);
      if (offset < 0) {
        ret += "-";
        offset *= -1;
      } else {
        ret += "+";
      }
      ret += pad(Math.floor(offset / 60), 2) + ":" + pad(offset % 60, 2);
      if (isBCYear) ret += " BC";
      return ret;
    }
    __name(dateToString, "dateToString");
    function dateToStringUTC(date) {
      var year = date.getUTCFullYear();
      var isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      var ret = pad(year, 4) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2) + "T" + pad(date.getUTCHours(), 2) + ":" + pad(date.getUTCMinutes(), 2) + ":" + pad(date.getUTCSeconds(), 2) + "." + pad(date.getUTCMilliseconds(), 3);
      ret += "+00:00";
      if (isBCYear) ret += " BC";
      return ret;
    }
    __name(dateToStringUTC, "dateToStringUTC");
    function normalizeQueryConfig(config, values, callback) {
      config = typeof config === "string" ? { text: config } : config;
      if (values) {
        if (typeof values === "function") {
          config.callback = values;
        } else {
          config.values = values;
        }
      }
      if (callback) {
        config.callback = callback;
      }
      return config;
    }
    __name(normalizeQueryConfig, "normalizeQueryConfig");
    var escapeIdentifier = /* @__PURE__ */ __name(function(str) {
      return '"' + str.replace(/"/g, '""') + '"';
    }, "escapeIdentifier");
    var escapeLiteral = /* @__PURE__ */ __name(function(str) {
      var hasBackslash = false;
      var escaped = "'";
      for (var i = 0; i < str.length; i++) {
        var c = str[i];
        if (c === "'") {
          escaped += c + c;
        } else if (c === "\\") {
          escaped += c + c;
          hasBackslash = true;
        } else {
          escaped += c;
        }
      }
      escaped += "'";
      if (hasBackslash === true) {
        escaped = " E" + escaped;
      }
      return escaped;
    }, "escapeLiteral");
    module.exports = {
      prepareValue: /* @__PURE__ */ __name(function prepareValueWrapper(value) {
        return prepareValue(value);
      }, "prepareValueWrapper"),
      normalizeQueryConfig,
      escapeIdentifier,
      escapeLiteral
    };
  }
});

// node-built-in-modules:crypto
import libDefault2 from "crypto";
var require_crypto = __commonJS({
  "node-built-in-modules:crypto"(exports, module) {
    module.exports = libDefault2;
  }
});

// ../node_modules/pg/lib/crypto/utils-legacy.js
var require_utils_legacy = __commonJS({
  "../node_modules/pg/lib/crypto/utils-legacy.js"(exports, module) {
    "use strict";
    var nodeCrypto = require_crypto();
    function md5(string) {
      return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
    }
    __name(md5, "md5");
    function postgresMd5PasswordHash(user, password, salt) {
      var inner = md5(password + user);
      var outer = md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    __name(postgresMd5PasswordHash, "postgresMd5PasswordHash");
    function sha2562(text) {
      return nodeCrypto.createHash("sha256").update(text).digest();
    }
    __name(sha2562, "sha256");
    function hmacSha256(key, msg) {
      return nodeCrypto.createHmac("sha256", key).update(msg).digest();
    }
    __name(hmacSha256, "hmacSha256");
    async function deriveKey(password, salt, iterations) {
      return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
    }
    __name(deriveKey, "deriveKey");
    module.exports = {
      postgresMd5PasswordHash,
      randomBytes: nodeCrypto.randomBytes,
      deriveKey,
      sha256: sha2562,
      hmacSha256,
      md5
    };
  }
});

// ../node_modules/pg/lib/crypto/utils-webcrypto.js
var require_utils_webcrypto = __commonJS({
  "../node_modules/pg/lib/crypto/utils-webcrypto.js"(exports, module) {
    var nodeCrypto = require_crypto();
    module.exports = {
      postgresMd5PasswordHash,
      randomBytes,
      deriveKey,
      sha256: sha2562,
      hmacSha256,
      md5
    };
    var webCrypto = nodeCrypto.webcrypto || globalThis.crypto;
    var subtleCrypto = webCrypto.subtle;
    var textEncoder = new TextEncoder();
    function randomBytes(length) {
      return webCrypto.getRandomValues(Buffer.alloc(length));
    }
    __name(randomBytes, "randomBytes");
    async function md5(string) {
      try {
        return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
      } catch (e) {
        const data = typeof string === "string" ? textEncoder.encode(string) : string;
        const hash = await subtleCrypto.digest("MD5", data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    __name(md5, "md5");
    async function postgresMd5PasswordHash(user, password, salt) {
      var inner = await md5(password + user);
      var outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    __name(postgresMd5PasswordHash, "postgresMd5PasswordHash");
    async function sha2562(text) {
      return await subtleCrypto.digest("SHA-256", text);
    }
    __name(sha2562, "sha256");
    async function hmacSha256(keyBuffer, msg) {
      const key = await subtleCrypto.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return await subtleCrypto.sign("HMAC", key, textEncoder.encode(msg));
    }
    __name(hmacSha256, "hmacSha256");
    async function deriveKey(password, salt, iterations) {
      const key = await subtleCrypto.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations };
      return await subtleCrypto.deriveBits(params, key, 32 * 8, ["deriveBits"]);
    }
    __name(deriveKey, "deriveKey");
  }
});

// ../node_modules/pg/lib/crypto/utils.js
var require_utils2 = __commonJS({
  "../node_modules/pg/lib/crypto/utils.js"(exports, module) {
    "use strict";
    var useLegacyCrypto = parseInt(process.versions && process.versions.node && process.versions.node.split(".")[0]) < 15;
    if (useLegacyCrypto) {
      module.exports = require_utils_legacy();
    } else {
      module.exports = require_utils_webcrypto();
    }
  }
});

// ../node_modules/pg/lib/crypto/sasl.js
var require_sasl = __commonJS({
  "../node_modules/pg/lib/crypto/sasl.js"(exports, module) {
    "use strict";
    var crypto2 = require_utils2();
    function startSession(mechanisms) {
      if (mechanisms.indexOf("SCRAM-SHA-256") === -1) {
        throw new Error("SASL: Only mechanism SCRAM-SHA-256 is currently supported");
      }
      const clientNonce = crypto2.randomBytes(18).toString("base64");
      return {
        mechanism: "SCRAM-SHA-256",
        clientNonce,
        response: "n,,n=*,r=" + clientNonce,
        message: "SASLInitialResponse"
      };
    }
    __name(startSession, "startSession");
    async function continueSession(session, password, serverData) {
      if (session.message !== "SASLInitialResponse") {
        throw new Error("SASL: Last message was not SASLInitialResponse");
      }
      if (typeof password !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
      }
      if (password === "") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
      }
      const sv = parseServerFirstMessage(serverData);
      if (!sv.nonce.startsWith(session.clientNonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
      } else if (sv.nonce.length === session.clientNonce.length) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
      }
      var clientFirstMessageBare = "n=*,r=" + session.clientNonce;
      var serverFirstMessage = "r=" + sv.nonce + ",s=" + sv.salt + ",i=" + sv.iteration;
      var clientFinalMessageWithoutProof = "c=biws,r=" + sv.nonce;
      var authMessage = clientFirstMessageBare + "," + serverFirstMessage + "," + clientFinalMessageWithoutProof;
      var saltBytes = Buffer.from(sv.salt, "base64");
      var saltedPassword = await crypto2.deriveKey(password, saltBytes, sv.iteration);
      var clientKey = await crypto2.hmacSha256(saltedPassword, "Client Key");
      var storedKey = await crypto2.sha256(clientKey);
      var clientSignature = await crypto2.hmacSha256(storedKey, authMessage);
      var clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString("base64");
      var serverKey = await crypto2.hmacSha256(saltedPassword, "Server Key");
      var serverSignatureBytes = await crypto2.hmacSha256(serverKey, authMessage);
      session.message = "SASLResponse";
      session.serverSignature = Buffer.from(serverSignatureBytes).toString("base64");
      session.response = clientFinalMessageWithoutProof + ",p=" + clientProof;
    }
    __name(continueSession, "continueSession");
    function finalizeSession(session, serverData) {
      if (session.message !== "SASLResponse") {
        throw new Error("SASL: Last message was not SASLResponse");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
      }
      const { serverSignature } = parseServerFinalMessage(serverData);
      if (serverSignature !== session.serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
    }
    __name(finalizeSession, "finalizeSession");
    function isPrintableChars(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: text must be a string");
      }
      return text.split("").map((_, i) => text.charCodeAt(i)).every((c) => c >= 33 && c <= 43 || c >= 45 && c <= 126);
    }
    __name(isPrintableChars, "isPrintableChars");
    function isBase64(text) {
      return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text);
    }
    __name(isBase64, "isBase64");
    function parseAttributePairs(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: attribute pairs text must be a string");
      }
      return new Map(
        text.split(",").map((attrValue) => {
          if (!/^.=/.test(attrValue)) {
            throw new Error("SASL: Invalid attribute pair entry");
          }
          const name2 = attrValue[0];
          const value = attrValue.substring(2);
          return [name2, value];
        })
      );
    }
    __name(parseAttributePairs, "parseAttributePairs");
    function parseServerFirstMessage(data) {
      const attrPairs = parseAttributePairs(data);
      const nonce = attrPairs.get("r");
      if (!nonce) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
      } else if (!isPrintableChars(nonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
      }
      const salt = attrPairs.get("s");
      if (!salt) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
      } else if (!isBase64(salt)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
      }
      const iterationText = attrPairs.get("i");
      if (!iterationText) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
      } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
      }
      const iteration = parseInt(iterationText, 10);
      return {
        nonce,
        salt,
        iteration
      };
    }
    __name(parseServerFirstMessage, "parseServerFirstMessage");
    function parseServerFinalMessage(serverData) {
      const attrPairs = parseAttributePairs(serverData);
      const serverSignature = attrPairs.get("v");
      if (!serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
      } else if (!isBase64(serverSignature)) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
      }
      return {
        serverSignature
      };
    }
    __name(parseServerFinalMessage, "parseServerFinalMessage");
    function xorBuffers(a, b) {
      if (!Buffer.isBuffer(a)) {
        throw new TypeError("first argument must be a Buffer");
      }
      if (!Buffer.isBuffer(b)) {
        throw new TypeError("second argument must be a Buffer");
      }
      if (a.length !== b.length) {
        throw new Error("Buffer lengths must match");
      }
      if (a.length === 0) {
        throw new Error("Buffers cannot be empty");
      }
      return Buffer.from(a.map((_, i) => a[i] ^ b[i]));
    }
    __name(xorBuffers, "xorBuffers");
    module.exports = {
      startSession,
      continueSession,
      finalizeSession
    };
  }
});

// ../node_modules/pg/lib/type-overrides.js
var require_type_overrides = __commonJS({
  "../node_modules/pg/lib/type-overrides.js"(exports, module) {
    "use strict";
    var types3 = require_pg_types();
    function TypeOverrides(userTypes) {
      this._types = userTypes || types3;
      this.text = {};
      this.binary = {};
    }
    __name(TypeOverrides, "TypeOverrides");
    TypeOverrides.prototype.getOverrides = function(format) {
      switch (format) {
        case "text":
          return this.text;
        case "binary":
          return this.binary;
        default:
          return {};
      }
    };
    TypeOverrides.prototype.setTypeParser = function(oid, format, parseFn) {
      if (typeof format === "function") {
        parseFn = format;
        format = "text";
      }
      this.getOverrides(format)[oid] = parseFn;
    };
    TypeOverrides.prototype.getTypeParser = function(oid, format) {
      format = format || "text";
      return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format);
    };
    module.exports = TypeOverrides;
  }
});

// node-built-in-modules:dns
import libDefault3 from "dns";
var require_dns = __commonJS({
  "node-built-in-modules:dns"(exports, module) {
    module.exports = libDefault3;
  }
});

// node-built-in-modules:fs
import libDefault4 from "fs";
var require_fs = __commonJS({
  "node-built-in-modules:fs"(exports, module) {
    module.exports = libDefault4;
  }
});

// ../node_modules/pg-connection-string/index.js
var require_pg_connection_string = __commonJS({
  "../node_modules/pg-connection-string/index.js"(exports, module) {
    "use strict";
    function parse(str, options = {}) {
      if (str.charAt(0) === "/") {
        const config2 = str.split(" ");
        return { host: config2[0], database: config2[1] };
      }
      const config = /* @__PURE__ */ Object.create(null);
      let result;
      let dummyHost = false;
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
        str = encodeURI(str).replace(/%25(\d\d)/g, "%$1");
      }
      try {
        try {
          result = new URL(str, "postgres://base");
        } catch (e) {
          result = new URL(str.replace("@/", "@___DUMMY___/"), "postgres://base");
          dummyHost = true;
        }
      } catch (err) {
        err.input && (err.input = "*****REDACTED*****");
        throw err;
      }
      for (const entry of result.searchParams.entries()) {
        config[entry[0]] = entry[1];
      }
      config.user = config.user || decodeURIComponent(result.username);
      config.password = config.password || decodeURIComponent(result.password);
      if (result.protocol == "socket:") {
        config.host = decodeURI(result.pathname);
        config.database = result.searchParams.get("db");
        config.client_encoding = result.searchParams.get("encoding");
        return config;
      }
      const hostname = dummyHost ? "" : result.hostname;
      if (!config.host) {
        config.host = decodeURIComponent(hostname);
      } else if (hostname && /^%2f/i.test(hostname)) {
        result.pathname = hostname + result.pathname;
      }
      if (!config.port) {
        config.port = result.port;
      }
      const pathname = result.pathname.slice(1) || null;
      config.database = pathname ? decodeURI(pathname) : null;
      if (config.ssl === "true" || config.ssl === "1") {
        config.ssl = true;
      }
      if (config.ssl === "0") {
        config.ssl = false;
      }
      if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
        config.ssl = {};
      }
      if (config.sslnegotiation === "direct" && config.ssl === void 0) {
        config.ssl = true;
      }
      const fs = config.sslcert || config.sslkey || config.sslrootcert ? require_fs() : null;
      if (config.sslcert) {
        config.ssl.cert = fs.readFileSync(config.sslcert).toString();
      }
      if (config.sslkey) {
        config.ssl.key = fs.readFileSync(config.sslkey).toString();
      }
      if (config.sslrootcert) {
        config.ssl.ca = fs.readFileSync(config.sslrootcert).toString();
      }
      if (options.useLibpqCompat && config.uselibpqcompat) {
        throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
      }
      if (config.uselibpqcompat === "true" || options.useLibpqCompat) {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
          case "require": {
            if (config.sslrootcert) {
              config.ssl.checkServerIdentity = function() {
              };
            } else {
              config.ssl.rejectUnauthorized = false;
            }
            break;
          }
          case "verify-ca": {
            if (!config.ssl.ca) {
              throw new Error(
                "SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security."
              );
            }
            config.ssl.checkServerIdentity = function() {
            };
            break;
          }
          case "verify-full": {
            break;
          }
        }
      } else {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full": {
            if (config.sslmode !== "verify-full") {
              deprecatedSslModeWarning(config.sslmode);
            }
            break;
          }
          case "no-verify": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
        }
      }
      return config;
    }
    __name(parse, "parse");
    function toConnectionOptions(sslConfig) {
      const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
        if (value !== void 0 && value !== null) {
          c[key] = value;
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return connectionOptions;
    }
    __name(toConnectionOptions, "toConnectionOptions");
    function toClientConfig(config) {
      const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
        if (key === "ssl") {
          const sslConfig = value;
          if (typeof sslConfig === "boolean") {
            c[key] = sslConfig;
          }
          if (typeof sslConfig === "object") {
            c[key] = toConnectionOptions(sslConfig);
          }
        } else if (value !== void 0 && value !== null) {
          if (key === "port") {
            if (value !== "") {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                throw new Error(`Invalid ${key}: ${value}`);
              }
              c[key] = v;
            }
          } else {
            c[key] = value;
          }
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return poolConfig;
    }
    __name(toClientConfig, "toClientConfig");
    function parseIntoClientConfig(str) {
      return toClientConfig(parse(str));
    }
    __name(parseIntoClientConfig, "parseIntoClientConfig");
    function deprecatedSslModeWarning(sslmode) {
      if (!deprecatedSslModeWarning.warned && typeof process !== "undefined" && process.emitWarning) {
        deprecatedSslModeWarning.warned = true;
        process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`);
      }
    }
    __name(deprecatedSslModeWarning, "deprecatedSslModeWarning");
    module.exports = parse;
    parse.parse = parse;
    parse.toClientConfig = toClientConfig;
    parse.parseIntoClientConfig = parseIntoClientConfig;
  }
});

// ../node_modules/pg/lib/connection-parameters.js
var require_connection_parameters = __commonJS({
  "../node_modules/pg/lib/connection-parameters.js"(exports, module) {
    "use strict";
    var dns = require_dns();
    var defaults = require_defaults();
    var parse = require_pg_connection_string().parse;
    var val = /* @__PURE__ */ __name(function(key, config, envVar) {
      if (envVar === void 0) {
        envVar = process.env["PG" + key.toUpperCase()];
      } else if (envVar === false) {
      } else {
        envVar = process.env[envVar];
      }
      return config[key] || envVar || defaults[key];
    }, "val");
    var readSSLConfigFromEnvironment = /* @__PURE__ */ __name(function() {
      switch (process.env.PGSSLMODE) {
        case "disable":
          return false;
        case "prefer":
        case "require":
        case "verify-ca":
        case "verify-full":
          return true;
        case "no-verify":
          return { rejectUnauthorized: false };
      }
      return defaults.ssl;
    }, "readSSLConfigFromEnvironment");
    var quoteParamValue = /* @__PURE__ */ __name(function(value) {
      return "'" + ("" + value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    }, "quoteParamValue");
    var add = /* @__PURE__ */ __name(function(params, config, paramName) {
      var value = config[paramName];
      if (value !== void 0 && value !== null) {
        params.push(paramName + "=" + quoteParamValue(value));
      }
    }, "add");
    var ConnectionParameters = class {
      static {
        __name(this, "ConnectionParameters");
      }
      constructor(config) {
        config = typeof config === "string" ? parse(config) : config || {};
        if (config.connectionString) {
          config = Object.assign({}, config, parse(config.connectionString));
        }
        this.user = val("user", config);
        this.database = val("database", config);
        if (this.database === void 0) {
          this.database = this.user;
        }
        this.port = parseInt(val("port", config), 10);
        this.host = val("host", config);
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: val("password", config)
        });
        this.binary = val("binary", config);
        this.options = val("options", config);
        this.ssl = typeof config.ssl === "undefined" ? readSSLConfigFromEnvironment() : config.ssl;
        if (typeof this.ssl === "string") {
          if (this.ssl === "true") {
            this.ssl = true;
          }
        }
        if (this.ssl === "no-verify") {
          this.ssl = { rejectUnauthorized: false };
        }
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this.client_encoding = val("client_encoding", config);
        this.replication = val("replication", config);
        this.isDomainSocket = !(this.host || "").indexOf("/");
        this.application_name = val("application_name", config, "PGAPPNAME");
        this.fallback_application_name = val("fallback_application_name", config, false);
        this.statement_timeout = val("statement_timeout", config, false);
        this.lock_timeout = val("lock_timeout", config, false);
        this.idle_in_transaction_session_timeout = val("idle_in_transaction_session_timeout", config, false);
        this.query_timeout = val("query_timeout", config, false);
        if (config.connectionTimeoutMillis === void 0) {
          this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0;
        } else {
          this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1e3);
        }
        if (config.keepAlive === false) {
          this.keepalives = 0;
        } else if (config.keepAlive === true) {
          this.keepalives = 1;
        }
        if (typeof config.keepAliveInitialDelayMillis === "number") {
          this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1e3);
        }
      }
      getLibpqConnectionString(cb) {
        var params = [];
        add(params, this, "user");
        add(params, this, "password");
        add(params, this, "port");
        add(params, this, "application_name");
        add(params, this, "fallback_application_name");
        add(params, this, "connect_timeout");
        add(params, this, "options");
        var ssl = typeof this.ssl === "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
        add(params, ssl, "sslmode");
        add(params, ssl, "sslca");
        add(params, ssl, "sslkey");
        add(params, ssl, "sslcert");
        add(params, ssl, "sslrootcert");
        if (this.database) {
          params.push("dbname=" + quoteParamValue(this.database));
        }
        if (this.replication) {
          params.push("replication=" + quoteParamValue(this.replication));
        }
        if (this.host) {
          params.push("host=" + quoteParamValue(this.host));
        }
        if (this.isDomainSocket) {
          return cb(null, params.join(" "));
        }
        if (this.client_encoding) {
          params.push("client_encoding=" + quoteParamValue(this.client_encoding));
        }
        dns.lookup(this.host, function(err, address) {
          if (err) return cb(err, null);
          params.push("hostaddr=" + quoteParamValue(address));
          return cb(null, params.join(" "));
        });
      }
    };
    module.exports = ConnectionParameters;
  }
});

// ../node_modules/pg/lib/result.js
var require_result = __commonJS({
  "../node_modules/pg/lib/result.js"(exports, module) {
    "use strict";
    var types3 = require_pg_types();
    var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
    var Result = class {
      static {
        __name(this, "Result");
      }
      constructor(rowMode, types4) {
        this.command = null;
        this.rowCount = null;
        this.oid = null;
        this.rows = [];
        this.fields = [];
        this._parsers = void 0;
        this._types = types4;
        this.RowCtor = null;
        this.rowAsArray = rowMode === "array";
        if (this.rowAsArray) {
          this.parseRow = this._parseRowAsArray;
        }
        this._prebuiltEmptyResultObject = null;
      }
      // adds a command complete message
      addCommandComplete(msg) {
        var match;
        if (msg.text) {
          match = matchRegexp.exec(msg.text);
        } else {
          match = matchRegexp.exec(msg.command);
        }
        if (match) {
          this.command = match[1];
          if (match[3]) {
            this.oid = parseInt(match[2], 10);
            this.rowCount = parseInt(match[3], 10);
          } else if (match[2]) {
            this.rowCount = parseInt(match[2], 10);
          }
        }
      }
      _parseRowAsArray(rowData) {
        var row = new Array(rowData.length);
        for (var i = 0, len = rowData.length; i < len; i++) {
          var rawValue = rowData[i];
          if (rawValue !== null) {
            row[i] = this._parsers[i](rawValue);
          } else {
            row[i] = null;
          }
        }
        return row;
      }
      parseRow(rowData) {
        var row = { ...this._prebuiltEmptyResultObject };
        for (var i = 0, len = rowData.length; i < len; i++) {
          var rawValue = rowData[i];
          var field = this.fields[i].name;
          if (rawValue !== null) {
            row[field] = this._parsers[i](rawValue);
          } else {
            row[field] = null;
          }
        }
        return row;
      }
      addRow(row) {
        this.rows.push(row);
      }
      addFields(fieldDescriptions) {
        this.fields = fieldDescriptions;
        if (this.fields.length) {
          this._parsers = new Array(fieldDescriptions.length);
        }
        var row = {};
        for (var i = 0; i < fieldDescriptions.length; i++) {
          var desc = fieldDescriptions[i];
          row[desc.name] = null;
          if (this._types) {
            this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || "text");
          } else {
            this._parsers[i] = types3.getTypeParser(desc.dataTypeID, desc.format || "text");
          }
        }
        this._prebuiltEmptyResultObject = { ...row };
      }
    };
    module.exports = Result;
  }
});

// ../node_modules/pg/lib/query.js
var require_query = __commonJS({
  "../node_modules/pg/lib/query.js"(exports, module) {
    "use strict";
    var { EventEmitter } = require_events();
    var Result = require_result();
    var utils = require_utils();
    var Query = class extends EventEmitter {
      static {
        __name(this, "Query");
      }
      constructor(config, values, callback) {
        super();
        config = utils.normalizeQueryConfig(config, values, callback);
        this.text = config.text;
        this.values = config.values;
        this.rows = config.rows;
        this.types = config.types;
        this.name = config.name;
        this.queryMode = config.queryMode;
        this.binary = config.binary;
        this.portal = config.portal || "";
        this.callback = config.callback;
        this._rowMode = config.rowMode;
        if (process.domain && config.callback) {
          this.callback = process.domain.bind(config.callback);
        }
        this._result = new Result(this._rowMode, this.types);
        this._results = this._result;
        this._canceledDueToError = false;
      }
      requiresPreparation() {
        if (this.queryMode === "extended") {
          return true;
        }
        if (this.name) {
          return true;
        }
        if (this.rows) {
          return true;
        }
        if (!this.text) {
          return false;
        }
        if (!this.values) {
          return false;
        }
        return this.values.length > 0;
      }
      _checkForMultirow() {
        if (this._result.command) {
          if (!Array.isArray(this._results)) {
            this._results = [this._result];
          }
          this._result = new Result(this._rowMode, this.types);
          this._results.push(this._result);
        }
      }
      // associates row metadata from the supplied
      // message with this query object
      // metadata used when parsing row results
      handleRowDescription(msg) {
        this._checkForMultirow();
        this._result.addFields(msg.fields);
        this._accumulateRows = this.callback || !this.listeners("row").length;
      }
      handleDataRow(msg) {
        let row;
        if (this._canceledDueToError) {
          return;
        }
        try {
          row = this._result.parseRow(msg.fields);
        } catch (err) {
          this._canceledDueToError = err;
          return;
        }
        this.emit("row", row, this._result);
        if (this._accumulateRows) {
          this._result.addRow(row);
        }
      }
      handleCommandComplete(msg, connection) {
        this._checkForMultirow();
        this._result.addCommandComplete(msg);
        if (this.rows) {
          connection.sync();
        }
      }
      // if a named prepared statement is created with empty query text
      // the backend will send an emptyQuery message but *not* a command complete message
      // since we pipeline sync immediately after execute we don't need to do anything here
      // unless we have rows specified, in which case we did not pipeline the intial sync call
      handleEmptyQuery(connection) {
        if (this.rows) {
          connection.sync();
        }
      }
      handleError(err, connection) {
        if (this._canceledDueToError) {
          err = this._canceledDueToError;
          this._canceledDueToError = false;
        }
        if (this.callback) {
          return this.callback(err);
        }
        this.emit("error", err);
      }
      handleReadyForQuery(con) {
        if (this._canceledDueToError) {
          return this.handleError(this._canceledDueToError, con);
        }
        if (this.callback) {
          try {
            this.callback(null, this._results);
          } catch (err) {
            process.nextTick(() => {
              throw err;
            });
          }
        }
        this.emit("end", this._results);
      }
      submit(connection) {
        if (typeof this.text !== "string" && typeof this.name !== "string") {
          return new Error("A query must have either text or a name. Supplying neither is unsupported.");
        }
        const previous = connection.parsedStatements[this.name];
        if (this.text && previous && this.text !== previous) {
          return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
        }
        if (this.values && !Array.isArray(this.values)) {
          return new Error("Query values must be an array");
        }
        if (this.requiresPreparation()) {
          this.prepare(connection);
        } else {
          connection.query(this.text);
        }
        return null;
      }
      hasBeenParsed(connection) {
        return this.name && connection.parsedStatements[this.name];
      }
      handlePortalSuspended(connection) {
        this._getRows(connection, this.rows);
      }
      _getRows(connection, rows) {
        connection.execute({
          portal: this.portal,
          rows
        });
        if (!rows) {
          connection.sync();
        } else {
          connection.flush();
        }
      }
      // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
      prepare(connection) {
        if (!this.hasBeenParsed(connection)) {
          connection.parse({
            text: this.text,
            name: this.name,
            types: this.types
          });
        }
        try {
          connection.bind({
            portal: this.portal,
            statement: this.name,
            values: this.values,
            binary: this.binary,
            valueMapper: utils.prepareValue
          });
        } catch (err) {
          this.handleError(err, connection);
          return;
        }
        connection.describe({
          type: "P",
          name: this.portal || ""
        });
        this._getRows(connection, this.rows);
      }
      handleCopyInResponse(connection) {
        connection.sendCopyFail("No source stream defined");
      }
      // eslint-disable-next-line no-unused-vars
      handleCopyData(msg, connection) {
      }
    };
    module.exports = Query;
  }
});

// ../node_modules/pg-protocol/dist/messages.js
var require_messages = __commonJS({
  "../node_modules/pg-protocol/dist/messages.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NoticeMessage = exports.DataRowMessage = exports.CommandCompleteMessage = exports.ReadyForQueryMessage = exports.NotificationResponseMessage = exports.BackendKeyDataMessage = exports.AuthenticationMD5Password = exports.ParameterStatusMessage = exports.ParameterDescriptionMessage = exports.RowDescriptionMessage = exports.Field = exports.CopyResponse = exports.CopyDataMessage = exports.DatabaseError = exports.copyDone = exports.emptyQuery = exports.replicationStart = exports.portalSuspended = exports.noData = exports.closeComplete = exports.bindComplete = exports.parseComplete = void 0;
    exports.parseComplete = {
      name: "parseComplete",
      length: 5
    };
    exports.bindComplete = {
      name: "bindComplete",
      length: 5
    };
    exports.closeComplete = {
      name: "closeComplete",
      length: 5
    };
    exports.noData = {
      name: "noData",
      length: 5
    };
    exports.portalSuspended = {
      name: "portalSuspended",
      length: 5
    };
    exports.replicationStart = {
      name: "replicationStart",
      length: 4
    };
    exports.emptyQuery = {
      name: "emptyQuery",
      length: 4
    };
    exports.copyDone = {
      name: "copyDone",
      length: 4
    };
    var DatabaseError = class extends Error {
      static {
        __name(this, "DatabaseError");
      }
      constructor(message, length, name2) {
        super(message);
        this.length = length;
        this.name = name2;
      }
    };
    exports.DatabaseError = DatabaseError;
    var CopyDataMessage = class {
      static {
        __name(this, "CopyDataMessage");
      }
      constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = "copyData";
      }
    };
    exports.CopyDataMessage = CopyDataMessage;
    var CopyResponse = class {
      static {
        __name(this, "CopyResponse");
      }
      constructor(length, name2, binary, columnCount) {
        this.length = length;
        this.name = name2;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
      }
    };
    exports.CopyResponse = CopyResponse;
    var Field = class {
      static {
        __name(this, "Field");
      }
      constructor(name2, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name2;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
      }
    };
    exports.Field = Field;
    var RowDescriptionMessage = class {
      static {
        __name(this, "RowDescriptionMessage");
      }
      constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = "rowDescription";
        this.fields = new Array(this.fieldCount);
      }
    };
    exports.RowDescriptionMessage = RowDescriptionMessage;
    var ParameterDescriptionMessage = class {
      static {
        __name(this, "ParameterDescriptionMessage");
      }
      constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = "parameterDescription";
        this.dataTypeIDs = new Array(this.parameterCount);
      }
    };
    exports.ParameterDescriptionMessage = ParameterDescriptionMessage;
    var ParameterStatusMessage = class {
      static {
        __name(this, "ParameterStatusMessage");
      }
      constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = "parameterStatus";
      }
    };
    exports.ParameterStatusMessage = ParameterStatusMessage;
    var AuthenticationMD5Password = class {
      static {
        __name(this, "AuthenticationMD5Password");
      }
      constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = "authenticationMD5Password";
      }
    };
    exports.AuthenticationMD5Password = AuthenticationMD5Password;
    var BackendKeyDataMessage = class {
      static {
        __name(this, "BackendKeyDataMessage");
      }
      constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = "backendKeyData";
      }
    };
    exports.BackendKeyDataMessage = BackendKeyDataMessage;
    var NotificationResponseMessage = class {
      static {
        __name(this, "NotificationResponseMessage");
      }
      constructor(length, processId, channel, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel;
        this.payload = payload;
        this.name = "notification";
      }
    };
    exports.NotificationResponseMessage = NotificationResponseMessage;
    var ReadyForQueryMessage = class {
      static {
        __name(this, "ReadyForQueryMessage");
      }
      constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = "readyForQuery";
      }
    };
    exports.ReadyForQueryMessage = ReadyForQueryMessage;
    var CommandCompleteMessage = class {
      static {
        __name(this, "CommandCompleteMessage");
      }
      constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = "commandComplete";
      }
    };
    exports.CommandCompleteMessage = CommandCompleteMessage;
    var DataRowMessage = class {
      static {
        __name(this, "DataRowMessage");
      }
      constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = "dataRow";
        this.fieldCount = fields.length;
      }
    };
    exports.DataRowMessage = DataRowMessage;
    var NoticeMessage = class {
      static {
        __name(this, "NoticeMessage");
      }
      constructor(length, message) {
        this.length = length;
        this.message = message;
        this.name = "notice";
      }
    };
    exports.NoticeMessage = NoticeMessage;
  }
});

// ../node_modules/pg-protocol/dist/buffer-writer.js
var require_buffer_writer = __commonJS({
  "../node_modules/pg-protocol/dist/buffer-writer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Writer = void 0;
    var Writer = class {
      static {
        __name(this, "Writer");
      }
      constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
      }
      ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
          const oldBuffer = this.buffer;
          const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
          this.buffer = Buffer.allocUnsafe(newSize);
          oldBuffer.copy(this.buffer);
        }
      }
      addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = num >>> 24 & 255;
        this.buffer[this.offset++] = num >>> 16 & 255;
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addCString(string) {
        if (!string) {
          this.ensure(1);
        } else {
          const len = Buffer.byteLength(string);
          this.ensure(len + 1);
          this.buffer.write(string, this.offset, "utf-8");
          this.offset += len;
        }
        this.buffer[this.offset++] = 0;
        return this;
      }
      addString(string = "") {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
      }
      // Write an Int32 byte-length prefix immediately followed by the string's UTF-8
      // bytes. Postgres' Bind wire format prefixes every parameter with its length,
      // and doing it in one method computes Buffer.byteLength ONCE — the previous
      // `addInt32(Buffer.byteLength(s)).addString(s)` pairing scanned the string
      // three times (byteLength for the prefix, byteLength again inside addString,
      // then the encode), which is costly for large text parameters.
      addInt32PrefixedString(string) {
        const len = Buffer.byteLength(string);
        this.ensure(4 + len);
        const buffer = this.buffer;
        let offset = this.offset;
        buffer[offset++] = len >>> 24 & 255;
        buffer[offset++] = len >>> 16 & 255;
        buffer[offset++] = len >>> 8 & 255;
        buffer[offset++] = len >>> 0 & 255;
        buffer.write(string, offset, "utf-8");
        this.offset = offset + len;
        return this;
      }
      add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
      }
      join(code) {
        if (code) {
          this.buffer[this.headerPosition] = code;
          const length = this.offset - (this.headerPosition + 1);
          this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
      }
      flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
      }
      clear() {
        this.offset = 5;
        this.headerPosition = 0;
      }
    };
    exports.Writer = Writer;
  }
});

// ../node_modules/pg-protocol/dist/serializer.js
var require_serializer = __commonJS({
  "../node_modules/pg-protocol/dist/serializer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.serialize = void 0;
    var buffer_writer_1 = require_buffer_writer();
    var writer = new buffer_writer_1.Writer();
    var startup = /* @__PURE__ */ __name((opts) => {
      writer.addInt16(3).addInt16(0);
      for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
      }
      writer.addCString("client_encoding").addCString("UTF8");
      const bodyBuffer = writer.addCString("").flush();
      const length = bodyBuffer.length + 4;
      return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
    }, "startup");
    var requestSsl = /* @__PURE__ */ __name(() => {
      const response = Buffer.allocUnsafe(8);
      response.writeInt32BE(8, 0);
      response.writeInt32BE(80877103, 4);
      return response;
    }, "requestSsl");
    var password = /* @__PURE__ */ __name((password2) => {
      return writer.addCString(password2).flush(
        112
        /* code.startup */
      );
    }, "password");
    var sendSASLInitialResponseMessage = /* @__PURE__ */ __name(function(mechanism, initialResponse) {
      writer.addCString(mechanism).addInt32PrefixedString(initialResponse);
      return writer.flush(
        112
        /* code.startup */
      );
    }, "sendSASLInitialResponseMessage");
    var sendSCRAMClientFinalMessage = /* @__PURE__ */ __name(function(additionalData) {
      return writer.addString(additionalData).flush(
        112
        /* code.startup */
      );
    }, "sendSCRAMClientFinalMessage");
    var query = /* @__PURE__ */ __name((text) => {
      return writer.addCString(text).flush(
        81
        /* code.query */
      );
    }, "query");
    var emptyArray = [];
    var parse = /* @__PURE__ */ __name((query2) => {
      const name2 = query2.name || "";
      if (name2.length > 63) {
        console.error("Warning! Postgres only supports 63 characters for query names.");
        console.error("You supplied %s (%s)", name2, name2.length);
        console.error("This can cause conflicts and silent errors executing queries");
      }
      const types3 = query2.types || emptyArray;
      const len = types3.length;
      const buffer = writer.addCString(name2).addCString(query2.text).addInt16(len);
      for (let i = 0; i < len; i++) {
        buffer.addInt32(types3[i]);
      }
      return writer.flush(
        80
        /* code.parse */
      );
    }, "parse");
    var paramWriter = new buffer_writer_1.Writer();
    var writeValues = /* @__PURE__ */ __name(function(values, valueMapper) {
      for (let i = 0; i < values.length; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        if (mappedVal == null) {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(-1);
        } else if (mappedVal instanceof Buffer) {
          writer.addInt16(
            1
            /* ParamType.BINARY */
          );
          paramWriter.addInt32(mappedVal.length);
          paramWriter.add(mappedVal);
        } else {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32PrefixedString(mappedVal);
        }
      }
    }, "writeValues");
    var bind = /* @__PURE__ */ __name((config = {}) => {
      const portal = config.portal || "";
      const statement = config.statement || "";
      const binary = config.binary || false;
      const values = config.values || emptyArray;
      const len = values.length;
      writer.addCString(portal).addCString(statement);
      writer.addInt16(len);
      try {
        writeValues(values, config.valueMapper);
      } catch (err) {
        writer.clear();
        paramWriter.clear();
        throw err;
      }
      writer.addInt16(len);
      writer.add(paramWriter.flush());
      writer.addInt16(1);
      writer.addInt16(
        binary ? 1 : 0
        /* ParamType.STRING */
      );
      return writer.flush(
        66
        /* code.bind */
      );
    }, "bind");
    var emptyExecute = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
    var execute = /* @__PURE__ */ __name((config) => {
      if (!config || !config.portal && !config.rows) {
        return emptyExecute;
      }
      const portal = config.portal || "";
      const rows = config.rows || 0;
      const portalLength = Buffer.byteLength(portal);
      const len = 4 + portalLength + 1 + 4;
      const buff = Buffer.allocUnsafe(1 + len);
      buff[0] = 69;
      buff.writeInt32BE(len, 1);
      buff.write(portal, 5, "utf-8");
      buff[portalLength + 5] = 0;
      buff.writeUInt32BE(rows, buff.length - 4);
      return buff;
    }, "execute");
    var cancel = /* @__PURE__ */ __name((processID, secretKey) => {
      const buffer = Buffer.allocUnsafe(16);
      buffer.writeInt32BE(16, 0);
      buffer.writeInt16BE(1234, 4);
      buffer.writeInt16BE(5678, 6);
      buffer.writeInt32BE(processID, 8);
      buffer.writeInt32BE(secretKey, 12);
      return buffer;
    }, "cancel");
    var cstringMessage = /* @__PURE__ */ __name((code, string) => {
      const stringLen = Buffer.byteLength(string);
      const len = 4 + stringLen + 1;
      const buffer = Buffer.allocUnsafe(1 + len);
      buffer[0] = code;
      buffer.writeInt32BE(len, 1);
      buffer.write(string, 5, "utf-8");
      buffer[len] = 0;
      return buffer;
    }, "cstringMessage");
    var emptyDescribePortal = writer.addCString("P").flush(
      68
      /* code.describe */
    );
    var emptyDescribeStatement = writer.addCString("S").flush(
      68
      /* code.describe */
    );
    var describe = /* @__PURE__ */ __name((msg) => {
      return msg.name ? cstringMessage(68, `${msg.type}${msg.name || ""}`) : msg.type === "P" ? emptyDescribePortal : emptyDescribeStatement;
    }, "describe");
    var close = /* @__PURE__ */ __name((msg) => {
      const text = `${msg.type}${msg.name || ""}`;
      return cstringMessage(67, text);
    }, "close");
    var copyData = /* @__PURE__ */ __name((chunk) => {
      return writer.add(chunk).flush(
        100
        /* code.copyFromChunk */
      );
    }, "copyData");
    var copyFail = /* @__PURE__ */ __name((message) => {
      return cstringMessage(102, message);
    }, "copyFail");
    var codeOnlyBuffer = /* @__PURE__ */ __name((code) => Buffer.from([code, 0, 0, 0, 4]), "codeOnlyBuffer");
    var flushBuffer = codeOnlyBuffer(
      72
      /* code.flush */
    );
    var syncBuffer = codeOnlyBuffer(
      83
      /* code.sync */
    );
    var endBuffer = codeOnlyBuffer(
      88
      /* code.end */
    );
    var copyDoneBuffer = codeOnlyBuffer(
      99
      /* code.copyDone */
    );
    var serialize = {
      startup,
      password,
      requestSsl,
      sendSASLInitialResponseMessage,
      sendSCRAMClientFinalMessage,
      query,
      parse,
      bind,
      execute,
      describe,
      close,
      flush: /* @__PURE__ */ __name(() => flushBuffer, "flush"),
      sync: /* @__PURE__ */ __name(() => syncBuffer, "sync"),
      end: /* @__PURE__ */ __name(() => endBuffer, "end"),
      copyData,
      copyDone: /* @__PURE__ */ __name(() => copyDoneBuffer, "copyDone"),
      copyFail,
      cancel
    };
    exports.serialize = serialize;
  }
});

// ../node_modules/pg-protocol/dist/buffer-reader.js
var require_buffer_reader = __commonJS({
  "../node_modules/pg-protocol/dist/buffer-reader.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BufferReader = void 0;
    var BufferReader = class {
      static {
        __name(this, "BufferReader");
      }
      constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        this.encoding = "utf-8";
      }
      setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
      }
      int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
      }
      byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
      }
      int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
      cstring() {
        const start = this.offset;
        let end = start;
        while (this.buffer[end++]) {
        }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
      }
      bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
    };
    exports.BufferReader = BufferReader;
  }
});

// ../node_modules/pg-protocol/dist/parser.js
var require_parser = __commonJS({
  "../node_modules/pg-protocol/dist/parser.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Parser = void 0;
    var messages_1 = require_messages();
    var buffer_reader_1 = require_buffer_reader();
    var CODE_LENGTH = 1;
    var LEN_LENGTH = 4;
    var HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
    var LATEINIT_LENGTH = -1;
    var emptyBuffer = Buffer.allocUnsafe(0);
    var Parser = class {
      static {
        __name(this, "Parser");
      }
      constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === "binary") {
          throw new Error("Binary mode not supported yet");
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || "text";
      }
      parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
          const code = this.buffer[offset];
          const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
          const fullMessageLength = CODE_LENGTH + length;
          if (fullMessageLength + offset <= bufferFullLength) {
            const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
            callback(message);
            offset += fullMessageLength;
          } else {
            break;
          }
        }
        if (offset === bufferFullLength) {
          this.buffer = emptyBuffer;
          this.bufferLength = 0;
          this.bufferOffset = 0;
        } else {
          this.bufferLength = bufferFullLength - offset;
          this.bufferOffset = offset;
        }
      }
      mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
          const newLength = this.bufferLength + buffer.byteLength;
          const newFullLength = newLength + this.bufferOffset;
          if (newFullLength > this.buffer.byteLength) {
            let newBuffer;
            if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
              newBuffer = this.buffer;
            } else {
              let newBufferLength = this.buffer.byteLength * 2;
              while (newLength >= newBufferLength) {
                newBufferLength *= 2;
              }
              newBuffer = Buffer.allocUnsafe(newBufferLength);
            }
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
          }
          buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
          this.bufferLength = newLength;
        } else {
          this.buffer = buffer;
          this.bufferOffset = 0;
          this.bufferLength = buffer.byteLength;
        }
      }
      handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        reader.setBuffer(offset, bytes);
        let message;
        switch (code) {
          case 50:
            message = messages_1.bindComplete;
            break;
          case 49:
            message = messages_1.parseComplete;
            break;
          case 51:
            message = messages_1.closeComplete;
            break;
          case 110:
            message = messages_1.noData;
            break;
          case 115:
            message = messages_1.portalSuspended;
            break;
          case 99:
            message = messages_1.copyDone;
            break;
          case 87:
            message = messages_1.replicationStart;
            break;
          case 73:
            message = messages_1.emptyQuery;
            break;
          case 68:
            message = parseDataRowMessage(reader);
            break;
          case 67:
            message = parseCommandCompleteMessage(reader);
            break;
          case 90:
            message = parseReadyForQueryMessage(reader);
            break;
          case 65:
            message = parseNotificationMessage(reader);
            break;
          case 82:
            message = parseAuthenticationResponse(reader, length);
            break;
          case 83:
            message = parseParameterStatusMessage(reader);
            break;
          case 75:
            message = parseBackendKeyData(reader);
            break;
          case 69:
            message = parseErrorMessage(reader, "error");
            break;
          case 78:
            message = parseErrorMessage(reader, "notice");
            break;
          case 84:
            message = parseRowDescriptionMessage(reader);
            break;
          case 116:
            message = parseParameterDescriptionMessage(reader);
            break;
          case 71:
            message = parseCopyInMessage(reader);
            break;
          case 72:
            message = parseCopyOutMessage(reader);
            break;
          case 100:
            message = parseCopyData(reader, length);
            break;
          default:
            return new messages_1.DatabaseError("received invalid response: " + code.toString(16), length, "error");
        }
        reader.setBuffer(0, emptyBuffer);
        message.length = length;
        return message;
      }
    };
    exports.Parser = Parser;
    var parseReadyForQueryMessage = /* @__PURE__ */ __name((reader) => {
      const status = reader.string(1);
      return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
    }, "parseReadyForQueryMessage");
    var parseCommandCompleteMessage = /* @__PURE__ */ __name((reader) => {
      const text = reader.cstring();
      return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
    }, "parseCommandCompleteMessage");
    var parseCopyData = /* @__PURE__ */ __name((reader, length) => {
      const chunk = reader.bytes(length - 4);
      return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
    }, "parseCopyData");
    var parseCopyInMessage = /* @__PURE__ */ __name((reader) => parseCopyMessage(reader, "copyInResponse"), "parseCopyInMessage");
    var parseCopyOutMessage = /* @__PURE__ */ __name((reader) => parseCopyMessage(reader, "copyOutResponse"), "parseCopyOutMessage");
    var parseCopyMessage = /* @__PURE__ */ __name((reader, messageName) => {
      const isBinary = reader.byte() !== 0;
      const columnCount = reader.int16();
      const message = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
      for (let i = 0; i < columnCount; i++) {
        message.columnTypes[i] = reader.int16();
      }
      return message;
    }, "parseCopyMessage");
    var parseNotificationMessage = /* @__PURE__ */ __name((reader) => {
      const processId = reader.int32();
      const channel = reader.cstring();
      const payload = reader.cstring();
      return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload);
    }, "parseNotificationMessage");
    var parseRowDescriptionMessage = /* @__PURE__ */ __name((reader) => {
      const fieldCount = reader.int16();
      const message = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        message.fields[i] = parseField(reader);
      }
      return message;
    }, "parseRowDescriptionMessage");
    var parseField = /* @__PURE__ */ __name((reader) => {
      const name2 = reader.cstring();
      const tableID = reader.uint32();
      const columnID = reader.int16();
      const dataTypeID = reader.uint32();
      const dataTypeSize = reader.int16();
      const dataTypeModifier = reader.int32();
      const mode = reader.int16() === 0 ? "text" : "binary";
      return new messages_1.Field(name2, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
    }, "parseField");
    var parseParameterDescriptionMessage = /* @__PURE__ */ __name((reader) => {
      const parameterCount = reader.int16();
      const message = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
      for (let i = 0; i < parameterCount; i++) {
        message.dataTypeIDs[i] = reader.uint32();
      }
      return message;
    }, "parseParameterDescriptionMessage");
    var parseDataRowMessage = /* @__PURE__ */ __name((reader) => {
      const fieldCount = reader.int16();
      const fields = new Array(fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        fields[i] = len === -1 ? null : reader.string(len);
      }
      return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
    }, "parseDataRowMessage");
    var parseParameterStatusMessage = /* @__PURE__ */ __name((reader) => {
      const name2 = reader.cstring();
      const value = reader.cstring();
      return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name2, value);
    }, "parseParameterStatusMessage");
    var parseBackendKeyData = /* @__PURE__ */ __name((reader) => {
      const processID = reader.int32();
      const secretKey = reader.int32();
      return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
    }, "parseBackendKeyData");
    var parseAuthenticationResponse = /* @__PURE__ */ __name((reader, length) => {
      const code = reader.int32();
      const message = {
        name: "authenticationOk",
        length
      };
      switch (code) {
        case 0:
          break;
        case 3:
          if (message.length === 8) {
            message.name = "authenticationCleartextPassword";
          }
          break;
        case 5:
          if (message.length === 12) {
            message.name = "authenticationMD5Password";
            const salt = reader.bytes(4);
            return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
          }
          break;
        case 10:
          {
            message.name = "authenticationSASL";
            message.mechanisms = [];
            let mechanism;
            do {
              mechanism = reader.cstring();
              if (mechanism) {
                message.mechanisms.push(mechanism);
              }
            } while (mechanism);
          }
          break;
        case 11:
          message.name = "authenticationSASLContinue";
          message.data = reader.string(length - 8);
          break;
        case 12:
          message.name = "authenticationSASLFinal";
          message.data = reader.string(length - 8);
          break;
        default:
          throw new Error("Unknown authenticationOk message type " + code);
      }
      return message;
    }, "parseAuthenticationResponse");
    var parseErrorMessage = /* @__PURE__ */ __name((reader, name2) => {
      const fields = {};
      let fieldType = reader.string(1);
      while (fieldType !== "\0") {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
      }
      const messageValue = fields.M;
      const message = name2 === "notice" ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue) : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name2);
      message.severity = fields.S;
      message.code = fields.C;
      message.detail = fields.D;
      message.hint = fields.H;
      message.position = fields.P;
      message.internalPosition = fields.p;
      message.internalQuery = fields.q;
      message.where = fields.W;
      message.schema = fields.s;
      message.table = fields.t;
      message.column = fields.c;
      message.dataType = fields.d;
      message.constraint = fields.n;
      message.file = fields.F;
      message.line = fields.L;
      message.routine = fields.R;
      return message;
    }, "parseErrorMessage");
  }
});

// ../node_modules/pg-protocol/dist/index.js
var require_dist = __commonJS({
  "../node_modules/pg-protocol/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DatabaseError = exports.serialize = void 0;
    exports.parse = parse;
    var messages_1 = require_messages();
    Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: /* @__PURE__ */ __name(function() {
      return messages_1.DatabaseError;
    }, "get") });
    var serializer_1 = require_serializer();
    Object.defineProperty(exports, "serialize", { enumerable: true, get: /* @__PURE__ */ __name(function() {
      return serializer_1.serialize;
    }, "get") });
    var parser_1 = require_parser();
    function parse(stream, callback) {
      const parser = new parser_1.Parser();
      stream.on("data", (buffer) => parser.parse(buffer, callback));
      return new Promise((resolve) => stream.on("end", () => resolve()));
    }
    __name(parse, "parse");
  }
});

// node-built-in-modules:net
import libDefault5 from "net";
var require_net = __commonJS({
  "node-built-in-modules:net"(exports, module) {
    module.exports = libDefault5;
  }
});

// node-built-in-modules:tls
import libDefault6 from "tls";
var require_tls = __commonJS({
  "node-built-in-modules:tls"(exports, module) {
    module.exports = libDefault6;
  }
});

// ../node_modules/pg-cloudflare/dist/index.js
var require_dist2 = __commonJS({
  "../node_modules/pg-cloudflare/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CloudflareSocket = void 0;
    var events_1 = require_events();
    var CloudflareSocket = class extends events_1.EventEmitter {
      static {
        __name(this, "CloudflareSocket");
      }
      constructor(ssl) {
        super();
        this.ssl = ssl;
        this.writable = false;
        this.destroyed = false;
        this._upgrading = false;
        this._upgraded = false;
        this._cfSocket = null;
        this._cfWriter = null;
        this._cfReader = null;
      }
      setNoDelay() {
        return this;
      }
      setKeepAlive() {
        return this;
      }
      ref() {
        return this;
      }
      unref() {
        return this;
      }
      async connect(port, host, connectListener) {
        try {
          log("connecting");
          if (connectListener)
            this.once("connect", connectListener);
          const options = this.ssl ? { secureTransport: "starttls" } : {};
          const mod = await import("cloudflare:sockets");
          const connect = mod.connect;
          this._cfSocket = connect(`${host}:${port}`, options);
          this._cfWriter = this._cfSocket.writable.getWriter();
          this._addClosedHandler();
          this._cfReader = this._cfSocket.readable.getReader();
          if (this.ssl) {
            this._listenOnce().catch((e) => this.emit("error", e));
          } else {
            this._listen().catch((e) => this.emit("error", e));
          }
          await this._cfWriter.ready;
          log("socket ready");
          this.writable = true;
          this.emit("connect");
          return this;
        } catch (e) {
          this.emit("error", e);
        }
      }
      async _listen() {
        while (true) {
          log("awaiting receive from CF socket");
          const { done, value } = await this._cfReader.read();
          log("CF socket received:", done, value);
          if (done) {
            log("done");
            break;
          }
          this.emit("data", Buffer.from(value));
        }
      }
      async _listenOnce() {
        log("awaiting first receive from CF socket");
        const { done, value } = await this._cfReader.read();
        log("First CF socket received:", done, value);
        this.emit("data", Buffer.from(value));
      }
      write(data, encoding = "utf8", callback = () => {
      }) {
        if (data.length === 0)
          return callback();
        if (typeof data === "string")
          data = Buffer.from(data, encoding);
        log("sending data direct:", data);
        this._cfWriter.write(data).then(() => {
          log("data sent");
          callback();
        }, (err) => {
          log("send error", err);
          callback(err);
        });
        return true;
      }
      end(data = Buffer.alloc(0), encoding = "utf8", callback = () => {
      }) {
        log("ending CF socket");
        this.write(data, encoding, (err) => {
          this._cfSocket.close();
          if (callback)
            callback(err);
        });
        return this;
      }
      destroy(reason) {
        log("destroying CF socket", reason);
        this.destroyed = true;
        return this.end();
      }
      startTls(options) {
        if (this._upgraded) {
          this.emit("error", "Cannot call `startTls()` more than once on a socket");
          return;
        }
        this._cfWriter.releaseLock();
        this._cfReader.releaseLock();
        this._upgrading = true;
        this._cfSocket = this._cfSocket.startTls(options);
        this._cfWriter = this._cfSocket.writable.getWriter();
        this._cfReader = this._cfSocket.readable.getReader();
        this._addClosedHandler();
        this._listen().catch((e) => this.emit("error", e));
      }
      _addClosedHandler() {
        this._cfSocket.closed.then(() => {
          if (!this._upgrading) {
            log("CF socket closed");
            this._cfSocket = null;
            this.emit("close");
          } else {
            this._upgrading = false;
            this._upgraded = true;
          }
        }).catch((e) => this.emit("error", e));
      }
    };
    exports.CloudflareSocket = CloudflareSocket;
    var debug3 = false;
    function dump(data) {
      if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
        const hex = buf.toString("hex");
        const str = new TextDecoder().decode(data);
        return `
>>> STR: "${str.replace(/\n/g, "\\n")}"
>>> HEX: ${hex}
`;
      } else {
        return data;
      }
    }
    __name(dump, "dump");
    function log(...args) {
      debug3 && console.log(...args.map(dump));
    }
    __name(log, "log");
  }
});

// ../node_modules/pg/lib/stream.js
var require_stream = __commonJS({
  "../node_modules/pg/lib/stream.js"(exports, module) {
    var { getStream, getSecureStream } = getStreamFuncs();
    module.exports = {
      /**
       * Get a socket stream compatible with the current runtime environment.
       * @returns {Duplex}
       */
      getStream,
      /**
       * Get a TLS secured socket, compatible with the current environment,
       * using the socket and other settings given in `options`.
       * @returns {Duplex}
       */
      getSecureStream
    };
    function getNodejsStreamFuncs() {
      function getStream2(ssl) {
        const net = require_net();
        return new net.Socket();
      }
      __name(getStream2, "getStream");
      function getSecureStream2(options) {
        var tls = require_tls();
        return tls.connect(options);
      }
      __name(getSecureStream2, "getSecureStream");
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    __name(getNodejsStreamFuncs, "getNodejsStreamFuncs");
    function getCloudflareStreamFuncs() {
      function getStream2(ssl) {
        const { CloudflareSocket } = require_dist2();
        return new CloudflareSocket(ssl);
      }
      __name(getStream2, "getStream");
      function getSecureStream2(options) {
        options.socket.startTls(options);
        return options.socket;
      }
      __name(getSecureStream2, "getSecureStream");
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    __name(getCloudflareStreamFuncs, "getCloudflareStreamFuncs");
    function isCloudflareRuntime() {
      if (typeof navigator === "object" && navigator !== null && true) {
        return true;
      }
      if (typeof Response === "function") {
        const resp = new Response(null, { cf: { thing: true } });
        if (typeof resp.cf === "object" && resp.cf !== null && resp.cf.thing) {
          return true;
        }
      }
      return false;
    }
    __name(isCloudflareRuntime, "isCloudflareRuntime");
    function getStreamFuncs() {
      if (isCloudflareRuntime()) {
        return getCloudflareStreamFuncs();
      }
      return getNodejsStreamFuncs();
    }
    __name(getStreamFuncs, "getStreamFuncs");
  }
});

// ../node_modules/pg/lib/connection.js
var require_connection = __commonJS({
  "../node_modules/pg/lib/connection.js"(exports, module) {
    "use strict";
    var EventEmitter = require_events().EventEmitter;
    var { parse, serialize } = require_dist();
    var { getStream, getSecureStream } = require_stream();
    var flushBuffer = serialize.flush();
    var syncBuffer = serialize.sync();
    var endBuffer = serialize.end();
    var Connection = class extends EventEmitter {
      static {
        __name(this, "Connection");
      }
      constructor(config) {
        super();
        config = config || {};
        this.stream = config.stream || getStream(config.ssl);
        if (typeof this.stream === "function") {
          this.stream = this.stream(config);
        }
        this._keepAlive = config.keepAlive;
        this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis;
        this.lastBuffer = false;
        this.parsedStatements = {};
        this.ssl = config.ssl || false;
        this._ending = false;
        this._emitMessage = false;
        var self2 = this;
        this.on("newListener", function(eventName) {
          if (eventName === "message") {
            self2._emitMessage = true;
          }
        });
      }
      connect(port, host) {
        var self2 = this;
        this._connecting = true;
        this.stream.setNoDelay(true);
        this.stream.connect(port, host);
        this.stream.once("connect", function() {
          if (self2._keepAlive) {
            self2.stream.setKeepAlive(true, self2._keepAliveInitialDelayMillis);
          }
          self2.emit("connect");
        });
        const reportStreamError = /* @__PURE__ */ __name(function(error) {
          if (self2._ending && (error.code === "ECONNRESET" || error.code === "EPIPE")) {
            return;
          }
          self2.emit("error", error);
        }, "reportStreamError");
        this.stream.on("error", reportStreamError);
        this.stream.on("close", function() {
          self2.emit("end");
        });
        if (!this.ssl) {
          return this.attachListeners(this.stream);
        }
        this.stream.once("data", function(buffer) {
          var responseCode = buffer.toString("utf8");
          switch (responseCode) {
            case "S":
              break;
            case "N":
              self2.stream.end();
              return self2.emit("error", new Error("The server does not support SSL connections"));
            default:
              self2.stream.end();
              return self2.emit("error", new Error("There was an error establishing an SSL connection"));
          }
          const options = {
            socket: self2.stream
          };
          if (self2.ssl !== true) {
            Object.assign(options, self2.ssl);
            if ("key" in self2.ssl) {
              options.key = self2.ssl.key;
            }
          }
          var net = require_net();
          if (net.isIP && net.isIP(host) === 0) {
            options.servername = host;
          }
          try {
            self2.stream = getSecureStream(options);
          } catch (err) {
            return self2.emit("error", err);
          }
          self2.attachListeners(self2.stream);
          self2.stream.on("error", reportStreamError);
          self2.emit("sslconnect");
        });
      }
      attachListeners(stream) {
        parse(stream, (msg) => {
          var eventName = msg.name === "error" ? "errorMessage" : msg.name;
          if (this._emitMessage) {
            this.emit("message", msg);
          }
          this.emit(eventName, msg);
        });
      }
      requestSsl() {
        this.stream.write(serialize.requestSsl());
      }
      startup(config) {
        this.stream.write(serialize.startup(config));
      }
      cancel(processID, secretKey) {
        this._send(serialize.cancel(processID, secretKey));
      }
      password(password) {
        this._send(serialize.password(password));
      }
      sendSASLInitialResponseMessage(mechanism, initialResponse) {
        this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse));
      }
      sendSCRAMClientFinalMessage(additionalData) {
        this._send(serialize.sendSCRAMClientFinalMessage(additionalData));
      }
      _send(buffer) {
        if (!this.stream.writable) {
          return false;
        }
        return this.stream.write(buffer);
      }
      query(text) {
        this._send(serialize.query(text));
      }
      // send parse message
      parse(query) {
        this._send(serialize.parse(query));
      }
      // send bind message
      bind(config) {
        this._send(serialize.bind(config));
      }
      // send execute message
      execute(config) {
        this._send(serialize.execute(config));
      }
      flush() {
        if (this.stream.writable) {
          this.stream.write(flushBuffer);
        }
      }
      sync() {
        this._ending = true;
        this._send(syncBuffer);
      }
      ref() {
        this.stream.ref();
      }
      unref() {
        this.stream.unref();
      }
      end() {
        this._ending = true;
        if (!this._connecting || !this.stream.writable) {
          this.stream.end();
          return;
        }
        return this.stream.write(endBuffer, () => {
          this.stream.end();
        });
      }
      close(msg) {
        this._send(serialize.close(msg));
      }
      describe(msg) {
        this._send(serialize.describe(msg));
      }
      sendCopyFromChunk(chunk) {
        this._send(serialize.copyData(chunk));
      }
      endCopyFrom() {
        this._send(serialize.copyDone());
      }
      sendCopyFail(msg) {
        this._send(serialize.copyFail(msg));
      }
    };
    module.exports = Connection;
  }
});

// node-built-in-modules:path
import libDefault7 from "path";
var require_path = __commonJS({
  "node-built-in-modules:path"(exports, module) {
    module.exports = libDefault7;
  }
});

// node-built-in-modules:stream
import libDefault8 from "stream";
var require_stream2 = __commonJS({
  "node-built-in-modules:stream"(exports, module) {
    module.exports = libDefault8;
  }
});

// node-built-in-modules:readline
import libDefault9 from "readline";
var require_readline = __commonJS({
  "node-built-in-modules:readline"(exports, module) {
    module.exports = libDefault9;
  }
});

// node-built-in-modules:util
import libDefault10 from "util";
var require_util = __commonJS({
  "node-built-in-modules:util"(exports, module) {
    module.exports = libDefault10;
  }
});

// ../node_modules/pgpass/lib/helper.js
var require_helper = __commonJS({
  "../node_modules/pgpass/lib/helper.js"(exports, module) {
    "use strict";
    var path = require_path();
    var Stream = require_stream2().Stream;
    var createInterface = require_readline().createInterface;
    var util = require_util();
    var defaultPort = 5432;
    var isWin = process.platform === "win32";
    var warnStream = process.stderr;
    var S_IRWXG = 56;
    var S_IRWXO = 7;
    var S_IFMT = 61440;
    var S_IFREG = 32768;
    function isRegFile(mode) {
      return (mode & S_IFMT) == S_IFREG;
    }
    __name(isRegFile, "isRegFile");
    var fieldNames = ["host", "port", "database", "user", "password"];
    var nrOfFields = fieldNames.length;
    var passKey = fieldNames[nrOfFields - 1];
    function warn() {
      var isWritable = warnStream instanceof Stream && true === warnStream.writable;
      if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write(util.format.apply(util, args));
      }
    }
    __name(warn, "warn");
    Object.defineProperty(module.exports, "isWin", {
      get: /* @__PURE__ */ __name(function() {
        return isWin;
      }, "get"),
      set: /* @__PURE__ */ __name(function(val) {
        isWin = val;
      }, "set")
    });
    module.exports.warnTo = function(stream) {
      var old = warnStream;
      warnStream = stream;
      return old;
    };
    module.exports.getFileName = function(rawEnv) {
      var env = rawEnv || process.env;
      var file = env.PGPASSFILE || (isWin ? path.join(env.APPDATA || "./", "postgresql", "pgpass.conf") : path.join(env.HOME || "./", ".pgpass"));
      return file;
    };
    module.exports.usePgPass = function(stats, fname) {
      if (Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD")) {
        return false;
      }
      if (isWin) {
        return true;
      }
      fname = fname || "<unkn>";
      if (!isRegFile(stats.mode)) {
        warn('WARNING: password file "%s" is not a plain file', fname);
        return false;
      }
      if (stats.mode & (S_IRWXG | S_IRWXO)) {
        warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
      }
      return true;
    };
    var matcher = module.exports.match = function(connInfo, entry) {
      return fieldNames.slice(0, -1).reduce(function(prev, field, idx) {
        if (idx == 1) {
          if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
            return prev && true;
          }
        }
        return prev && (entry[field] === "*" || entry[field] === connInfo[field]);
      }, true);
    };
    module.exports.getPassword = function(connInfo, stream, cb) {
      var pass;
      var isDone = false;
      var lineStream = createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      function finish(result) {
        isDone = true;
        stream.destroy();
        cb(result);
      }
      __name(finish, "finish");
      function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
          pass = entry[passKey];
          lineStream.close();
        }
      }
      __name(onLine, "onLine");
      var onEnd = /* @__PURE__ */ __name(function() {
        if (!isDone) {
          finish(pass);
        }
      }, "onEnd");
      var onErr = /* @__PURE__ */ __name(function(err) {
        if (isDone) {
          return;
        }
        warn("WARNING: error on reading file: %s", err);
        finish(void 0);
      }, "onErr");
      stream.on("error", onErr);
      lineStream.on("line", onLine).on("close", onEnd).on("error", onErr);
    };
    var parseLine = module.exports.parseLine = function(line) {
      if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
      }
      var curChar = "";
      var prevChar = "";
      var fieldIdx = 0;
      var startIdx = 0;
      var endIdx = 0;
      var obj = {};
      var isLastField = false;
      var addToObj = /* @__PURE__ */ __name(function(idx, i0, i1) {
        var field = line.substring(i0, i1);
        if (!Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE")) {
          field = field.replace(/\\([:\\])/g, "$1");
        }
        obj[fieldNames[idx]] = field;
      }, "addToObj");
      for (var i = 0; i < line.length - 1; i += 1) {
        curChar = line.charAt(i + 1);
        prevChar = line.charAt(i);
        isLastField = fieldIdx == nrOfFields - 1;
        if (isLastField) {
          addToObj(fieldIdx, startIdx);
          break;
        }
        if (i >= 0 && curChar == ":" && prevChar !== "\\") {
          addToObj(fieldIdx, startIdx, i + 1);
          startIdx = i + 2;
          fieldIdx += 1;
        }
      }
      obj = Object.keys(obj).length === nrOfFields ? obj : null;
      return obj;
    };
    var isValidEntry = module.exports.isValidEntry = function(entry) {
      var rules = {
        // host
        0: function(x) {
          return x.length > 0;
        },
        // port
        1: function(x) {
          if (x === "*") {
            return true;
          }
          x = Number(x);
          return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x;
        },
        // database
        2: function(x) {
          return x.length > 0;
        },
        // username
        3: function(x) {
          return x.length > 0;
        },
        // password
        4: function(x) {
          return x.length > 0;
        }
      };
      for (var idx = 0; idx < fieldNames.length; idx += 1) {
        var rule = rules[idx];
        var value = entry[fieldNames[idx]] || "";
        var res = rule(value);
        if (!res) {
          return false;
        }
      }
      return true;
    };
  }
});

// ../node_modules/pgpass/lib/index.js
var require_lib = __commonJS({
  "../node_modules/pgpass/lib/index.js"(exports, module) {
    "use strict";
    var path = require_path();
    var fs = require_fs();
    var helper = require_helper();
    module.exports = function(connInfo, cb) {
      var file = helper.getFileName();
      fs.stat(file, function(err, stat) {
        if (err || !helper.usePgPass(stat, file)) {
          return cb(void 0);
        }
        var st = fs.createReadStream(file);
        helper.getPassword(connInfo, st, cb);
      });
    };
    module.exports.warnTo = helper.warnTo;
  }
});

// ../node_modules/pg/lib/client.js
var require_client = __commonJS({
  "../node_modules/pg/lib/client.js"(exports, module) {
    "use strict";
    var EventEmitter = require_events().EventEmitter;
    var utils = require_utils();
    var sasl = require_sasl();
    var TypeOverrides = require_type_overrides();
    var ConnectionParameters = require_connection_parameters();
    var Query = require_query();
    var defaults = require_defaults();
    var Connection = require_connection();
    var crypto2 = require_utils2();
    var Client = class extends EventEmitter {
      static {
        __name(this, "Client");
      }
      constructor(config) {
        super();
        this.connectionParameters = new ConnectionParameters(config);
        this.user = this.connectionParameters.user;
        this.database = this.connectionParameters.database;
        this.port = this.connectionParameters.port;
        this.host = this.connectionParameters.host;
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this.connectionParameters.password
        });
        this.replication = this.connectionParameters.replication;
        var c = config || {};
        this._Promise = c.Promise || global.Promise;
        this._types = new TypeOverrides(c.types);
        this._ending = false;
        this._ended = false;
        this._connecting = false;
        this._connected = false;
        this._connectionError = false;
        this._queryable = true;
        this.connection = c.connection || new Connection({
          stream: c.stream,
          ssl: this.connectionParameters.ssl,
          keepAlive: c.keepAlive || false,
          keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
          encoding: this.connectionParameters.client_encoding || "utf8"
        });
        this.queryQueue = [];
        this.binary = c.binary || defaults.binary;
        this.processID = null;
        this.secretKey = null;
        this.ssl = this.connectionParameters.ssl || false;
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0;
      }
      _errorAllQueries(err) {
        const enqueueError = /* @__PURE__ */ __name((query) => {
          process.nextTick(() => {
            query.handleError(err, this.connection);
          });
        }, "enqueueError");
        if (this.activeQuery) {
          enqueueError(this.activeQuery);
          this.activeQuery = null;
        }
        this.queryQueue.forEach(enqueueError);
        this.queryQueue.length = 0;
      }
      _connect(callback) {
        var self2 = this;
        var con = this.connection;
        this._connectionCallback = callback;
        if (this._connecting || this._connected) {
          const err = new Error("Client has already been connected. You cannot reuse a client.");
          process.nextTick(() => {
            callback(err);
          });
          return;
        }
        this._connecting = true;
        if (this._connectionTimeoutMillis > 0) {
          this.connectionTimeoutHandle = setTimeout(() => {
            con._ending = true;
            con.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis);
        }
        if (this.host && this.host.indexOf("/") === 0) {
          con.connect(this.host + "/.s.PGSQL." + this.port);
        } else {
          con.connect(this.port, this.host);
        }
        con.on("connect", function() {
          if (self2.ssl) {
            con.requestSsl();
          } else {
            con.startup(self2.getStartupConf());
          }
        });
        con.on("sslconnect", function() {
          con.startup(self2.getStartupConf());
        });
        this._attachListeners(con);
        con.once("end", () => {
          const error = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
          clearTimeout(this.connectionTimeoutHandle);
          this._errorAllQueries(error);
          this._ended = true;
          if (!this._ending) {
            if (this._connecting && !this._connectionError) {
              if (this._connectionCallback) {
                this._connectionCallback(error);
              } else {
                this._handleErrorEvent(error);
              }
            } else if (!this._connectionError) {
              this._handleErrorEvent(error);
            }
          }
          process.nextTick(() => {
            this.emit("end");
          });
        });
      }
      connect(callback) {
        if (callback) {
          this._connect(callback);
          return;
        }
        return new this._Promise((resolve, reject) => {
          this._connect((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }
      _attachListeners(con) {
        con.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this));
        con.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this));
        con.on("authenticationSASL", this._handleAuthSASL.bind(this));
        con.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this));
        con.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this));
        con.on("backendKeyData", this._handleBackendKeyData.bind(this));
        con.on("error", this._handleErrorEvent.bind(this));
        con.on("errorMessage", this._handleErrorMessage.bind(this));
        con.on("readyForQuery", this._handleReadyForQuery.bind(this));
        con.on("notice", this._handleNotice.bind(this));
        con.on("rowDescription", this._handleRowDescription.bind(this));
        con.on("dataRow", this._handleDataRow.bind(this));
        con.on("portalSuspended", this._handlePortalSuspended.bind(this));
        con.on("emptyQuery", this._handleEmptyQuery.bind(this));
        con.on("commandComplete", this._handleCommandComplete.bind(this));
        con.on("parseComplete", this._handleParseComplete.bind(this));
        con.on("copyInResponse", this._handleCopyInResponse.bind(this));
        con.on("copyData", this._handleCopyData.bind(this));
        con.on("notification", this._handleNotification.bind(this));
      }
      // TODO(bmc): deprecate pgpass "built in" integration since this.password can be a function
      // it can be supplied by the user if required - this is a breaking change!
      _checkPgPass(cb) {
        const con = this.connection;
        if (typeof this.password === "function") {
          this._Promise.resolve().then(() => this.password()).then((pass) => {
            if (pass !== void 0) {
              if (typeof pass !== "string") {
                con.emit("error", new TypeError("Password must be a string"));
                return;
              }
              this.connectionParameters.password = this.password = pass;
            } else {
              this.connectionParameters.password = this.password = null;
            }
            cb();
          }).catch((err) => {
            con.emit("error", err);
          });
        } else if (this.password !== null) {
          cb();
        } else {
          try {
            const pgPass = require_lib();
            pgPass(this.connectionParameters, (pass) => {
              if (void 0 !== pass) {
                this.connectionParameters.password = this.password = pass;
              }
              cb();
            });
          } catch (e) {
            this.emit("error", e);
          }
        }
      }
      _handleAuthCleartextPassword(msg) {
        this._checkPgPass(() => {
          this.connection.password(this.password);
        });
      }
      _handleAuthMD5Password(msg) {
        this._checkPgPass(async () => {
          try {
            const hashedPassword = await crypto2.postgresMd5PasswordHash(this.user, this.password, msg.salt);
            this.connection.password(hashedPassword);
          } catch (e) {
            this.emit("error", e);
          }
        });
      }
      _handleAuthSASL(msg) {
        this._checkPgPass(() => {
          try {
            this.saslSession = sasl.startSession(msg.mechanisms);
            this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
          } catch (err) {
            this.connection.emit("error", err);
          }
        });
      }
      async _handleAuthSASLContinue(msg) {
        try {
          await sasl.continueSession(this.saslSession, this.password, msg.data);
          this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleAuthSASLFinal(msg) {
        try {
          sasl.finalizeSession(this.saslSession, msg.data);
          this.saslSession = null;
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleBackendKeyData(msg) {
        this.processID = msg.processID;
        this.secretKey = msg.secretKey;
      }
      _handleReadyForQuery(msg) {
        if (this._connecting) {
          this._connecting = false;
          this._connected = true;
          clearTimeout(this.connectionTimeoutHandle);
          if (this._connectionCallback) {
            this._connectionCallback(null, this);
            this._connectionCallback = null;
          }
          this.emit("connect");
        }
        const { activeQuery } = this;
        this.activeQuery = null;
        this.readyForQuery = true;
        if (activeQuery) {
          activeQuery.handleReadyForQuery(this.connection);
        }
        this._pulseQueryQueue();
      }
      // if we receieve an error event or error message
      // during the connection process we handle it here
      _handleErrorWhileConnecting(err) {
        if (this._connectionError) {
          return;
        }
        this._connectionError = true;
        clearTimeout(this.connectionTimeoutHandle);
        if (this._connectionCallback) {
          return this._connectionCallback(err);
        }
        this.emit("error", err);
      }
      // if we're connected and we receive an error event from the connection
      // this means the socket is dead - do a hard abort of all queries and emit
      // the socket error on the client as well
      _handleErrorEvent(err) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(err);
        }
        this._queryable = false;
        this._errorAllQueries(err);
        this.emit("error", err);
      }
      // handle error messages from the postgres backend
      _handleErrorMessage(msg) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(msg);
        }
        const activeQuery = this.activeQuery;
        if (!activeQuery) {
          this._handleErrorEvent(msg);
          return;
        }
        this.activeQuery = null;
        activeQuery.handleError(msg, this.connection);
      }
      _handleRowDescription(msg) {
        this.activeQuery.handleRowDescription(msg);
      }
      _handleDataRow(msg) {
        this.activeQuery.handleDataRow(msg);
      }
      _handlePortalSuspended(msg) {
        this.activeQuery.handlePortalSuspended(this.connection);
      }
      _handleEmptyQuery(msg) {
        this.activeQuery.handleEmptyQuery(this.connection);
      }
      _handleCommandComplete(msg) {
        if (this.activeQuery == null) {
          const error = new Error("Received unexpected commandComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        this.activeQuery.handleCommandComplete(msg, this.connection);
      }
      _handleParseComplete() {
        if (this.activeQuery == null) {
          const error = new Error("Received unexpected parseComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        if (this.activeQuery.name) {
          this.connection.parsedStatements[this.activeQuery.name] = this.activeQuery.text;
        }
      }
      _handleCopyInResponse(msg) {
        this.activeQuery.handleCopyInResponse(this.connection);
      }
      _handleCopyData(msg) {
        this.activeQuery.handleCopyData(msg, this.connection);
      }
      _handleNotification(msg) {
        this.emit("notification", msg);
      }
      _handleNotice(msg) {
        this.emit("notice", msg);
      }
      getStartupConf() {
        var params = this.connectionParameters;
        var data = {
          user: params.user,
          database: params.database
        };
        var appName = params.application_name || params.fallback_application_name;
        if (appName) {
          data.application_name = appName;
        }
        if (params.replication) {
          data.replication = "" + params.replication;
        }
        if (params.statement_timeout) {
          data.statement_timeout = String(parseInt(params.statement_timeout, 10));
        }
        if (params.lock_timeout) {
          data.lock_timeout = String(parseInt(params.lock_timeout, 10));
        }
        if (params.idle_in_transaction_session_timeout) {
          data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10));
        }
        if (params.options) {
          data.options = params.options;
        }
        return data;
      }
      cancel(client, query) {
        if (client.activeQuery === query) {
          var con = this.connection;
          if (this.host && this.host.indexOf("/") === 0) {
            con.connect(this.host + "/.s.PGSQL." + this.port);
          } else {
            con.connect(this.port, this.host);
          }
          con.on("connect", function() {
            con.cancel(client.processID, client.secretKey);
          });
        } else if (client.queryQueue.indexOf(query) !== -1) {
          client.queryQueue.splice(client.queryQueue.indexOf(query), 1);
        }
      }
      setTypeParser(oid, format, parseFn) {
        return this._types.setTypeParser(oid, format, parseFn);
      }
      getTypeParser(oid, format) {
        return this._types.getTypeParser(oid, format);
      }
      // escapeIdentifier and escapeLiteral moved to utility functions & exported
      // on PG
      // re-exported here for backwards compatibility
      escapeIdentifier(str) {
        return utils.escapeIdentifier(str);
      }
      escapeLiteral(str) {
        return utils.escapeLiteral(str);
      }
      _pulseQueryQueue() {
        if (this.readyForQuery === true) {
          this.activeQuery = this.queryQueue.shift();
          if (this.activeQuery) {
            this.readyForQuery = false;
            this.hasExecuted = true;
            const queryError = this.activeQuery.submit(this.connection);
            if (queryError) {
              process.nextTick(() => {
                this.activeQuery.handleError(queryError, this.connection);
                this.readyForQuery = true;
                this._pulseQueryQueue();
              });
            }
          } else if (this.hasExecuted) {
            this.activeQuery = null;
            this.emit("drain");
          }
        }
      }
      query(config, values, callback) {
        var query;
        var result;
        var readTimeout;
        var readTimeoutTimer;
        var queryCallback;
        if (config === null || config === void 0) {
          throw new TypeError("Client was passed a null or undefined query");
        } else if (typeof config.submit === "function") {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          result = query = config;
          if (typeof values === "function") {
            query.callback = query.callback || values;
          }
        } else {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          query = new Query(config, values, callback);
          if (!query.callback) {
            result = new this._Promise((resolve, reject) => {
              query.callback = (err, res) => err ? reject(err) : resolve(res);
            }).catch((err) => {
              Error.captureStackTrace(err);
              throw err;
            });
          }
        }
        if (readTimeout) {
          queryCallback = query.callback;
          readTimeoutTimer = setTimeout(() => {
            var error = new Error("Query read timeout");
            process.nextTick(() => {
              query.handleError(error, this.connection);
            });
            queryCallback(error);
            query.callback = () => {
            };
            var index = this.queryQueue.indexOf(query);
            if (index > -1) {
              this.queryQueue.splice(index, 1);
            }
            this._pulseQueryQueue();
          }, readTimeout);
          query.callback = (err, res) => {
            clearTimeout(readTimeoutTimer);
            queryCallback(err, res);
          };
        }
        if (this.binary && !query.binary) {
          query.binary = true;
        }
        if (query._result && !query._result._types) {
          query._result._types = this._types;
        }
        if (!this._queryable) {
          process.nextTick(() => {
            query.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._ending) {
          process.nextTick(() => {
            query.handleError(new Error("Client was closed and is not queryable"), this.connection);
          });
          return result;
        }
        this.queryQueue.push(query);
        this._pulseQueryQueue();
        return result;
      }
      ref() {
        this.connection.ref();
      }
      unref() {
        this.connection.unref();
      }
      end(cb) {
        this._ending = true;
        if (!this.connection._connecting || this._ended) {
          if (cb) {
            cb();
          } else {
            return this._Promise.resolve();
          }
        }
        if (this.activeQuery || !this._queryable) {
          this.connection.stream.destroy();
        } else {
          this.connection.end();
        }
        if (cb) {
          this.connection.once("end", cb);
        } else {
          return new this._Promise((resolve) => {
            this.connection.once("end", resolve);
          });
        }
      }
    };
    Client.Query = Query;
    module.exports = Client;
  }
});

// ../node_modules/pg-pool/index.js
var require_pg_pool = __commonJS({
  "../node_modules/pg-pool/index.js"(exports, module) {
    "use strict";
    var EventEmitter = require_events().EventEmitter;
    var NOOP = /* @__PURE__ */ __name(function() {
    }, "NOOP");
    var removeWhere = /* @__PURE__ */ __name((list, predicate) => {
      const i = list.findIndex(predicate);
      return i === -1 ? void 0 : list.splice(i, 1)[0];
    }, "removeWhere");
    var IdleItem = class {
      static {
        __name(this, "IdleItem");
      }
      constructor(client, idleListener, timeoutId) {
        this.client = client;
        this.idleListener = idleListener;
        this.timeoutId = timeoutId;
      }
    };
    var PendingItem = class {
      static {
        __name(this, "PendingItem");
      }
      constructor(callback) {
        this.callback = callback;
      }
    };
    function throwOnDoubleRelease() {
      throw new Error("Release called on client which has already been released to the pool.");
    }
    __name(throwOnDoubleRelease, "throwOnDoubleRelease");
    function promisify(Promise2, callback) {
      if (callback) {
        return { callback, result: void 0 };
      }
      let rej;
      let res;
      const cb = /* @__PURE__ */ __name(function(err, client) {
        err ? rej(err) : res(client);
      }, "cb");
      const result = new Promise2(function(resolve, reject) {
        res = resolve;
        rej = reject;
      }).catch((err) => {
        Error.captureStackTrace(err);
        throw err;
      });
      return { callback: cb, result };
    }
    __name(promisify, "promisify");
    function makeIdleListener(pool, client) {
      return /* @__PURE__ */ __name(function idleListener(err) {
        err.client = client;
        client.removeListener("error", idleListener);
        client.on("error", () => {
          pool.log("additional client error after disconnection due to error", err);
        });
        pool._remove(client);
        pool.emit("error", err, client);
      }, "idleListener");
    }
    __name(makeIdleListener, "makeIdleListener");
    var Pool = class extends EventEmitter {
      static {
        __name(this, "Pool");
      }
      constructor(options, Client) {
        super();
        this.options = Object.assign({}, options);
        if (options != null && "password" in options) {
          Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: options.password
          });
        }
        if (options != null && options.ssl && options.ssl.key) {
          Object.defineProperty(this.options.ssl, "key", {
            enumerable: false
          });
        }
        this.options.max = this.options.max || this.options.poolSize || 10;
        this.options.min = this.options.min || 0;
        this.options.maxUses = this.options.maxUses || Infinity;
        this.options.allowExitOnIdle = this.options.allowExitOnIdle || false;
        this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0;
        this.log = this.options.log || function() {
        };
        this.Client = this.options.Client || Client || require_lib2().Client;
        this.Promise = this.options.Promise || global.Promise;
        if (typeof this.options.idleTimeoutMillis === "undefined") {
          this.options.idleTimeoutMillis = 1e4;
        }
        this._clients = [];
        this._idle = [];
        this._expired = /* @__PURE__ */ new WeakSet();
        this._pendingQueue = [];
        this._endCallback = void 0;
        this.ending = false;
        this.ended = false;
      }
      _promiseTry(f) {
        const Promise2 = this.Promise;
        if (typeof Promise2.try === "function") {
          return Promise2.try(f);
        }
        return new Promise2((resolve) => resolve(f()));
      }
      _isFull() {
        return this._clients.length >= this.options.max;
      }
      _isAboveMin() {
        return this._clients.length > this.options.min;
      }
      _pulseQueue() {
        this.log("pulse queue");
        if (this.ended) {
          this.log("pulse queue ended");
          return;
        }
        if (this.ending) {
          this.log("pulse queue on ending");
          if (this._idle.length) {
            this._idle.slice().map((item) => {
              this._remove(item.client);
            });
          }
          if (!this._clients.length) {
            this.ended = true;
            this._endCallback();
          }
          return;
        }
        if (!this._pendingQueue.length) {
          this.log("no queued requests");
          return;
        }
        if (!this._idle.length && this._isFull()) {
          return;
        }
        const pendingItem = this._pendingQueue.shift();
        if (this._idle.length) {
          const idleItem = this._idle.pop();
          clearTimeout(idleItem.timeoutId);
          const client = idleItem.client;
          client.ref && client.ref();
          const idleListener = idleItem.idleListener;
          return this._acquireClient(client, pendingItem, idleListener, false);
        }
        if (!this._isFull()) {
          return this.newClient(pendingItem);
        }
        throw new Error("unexpected condition");
      }
      _remove(client, callback) {
        const removed = removeWhere(this._idle, (item) => item.client === client);
        if (removed !== void 0) {
          clearTimeout(removed.timeoutId);
        }
        this._clients = this._clients.filter((c) => c !== client);
        const context = this;
        client.end(() => {
          context.emit("remove", client);
          if (typeof callback === "function") {
            callback();
          }
        });
      }
      connect(cb) {
        if (this.ending) {
          const err = new Error("Cannot use a pool after calling end on the pool");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        const response = promisify(this.Promise, cb);
        const result = response.result;
        if (this._isFull() || this._idle.length) {
          if (this._idle.length) {
            process.nextTick(() => this._pulseQueue());
          }
          if (!this.options.connectionTimeoutMillis) {
            this._pendingQueue.push(new PendingItem(response.callback));
            return result;
          }
          const queueCallback = /* @__PURE__ */ __name((err, res, done) => {
            clearTimeout(tid);
            response.callback(err, res, done);
          }, "queueCallback");
          const pendingItem = new PendingItem(queueCallback);
          const tid = setTimeout(() => {
            removeWhere(this._pendingQueue, (i) => i.callback === queueCallback);
            pendingItem.timedOut = true;
            response.callback(new Error("timeout exceeded when trying to connect"));
          }, this.options.connectionTimeoutMillis);
          if (tid.unref) {
            tid.unref();
          }
          this._pendingQueue.push(pendingItem);
          return result;
        }
        this.newClient(new PendingItem(response.callback));
        return result;
      }
      newClient(pendingItem) {
        const client = new this.Client(this.options);
        this._clients.push(client);
        const idleListener = makeIdleListener(this, client);
        this.log("checking client timeout");
        let tid;
        let timeoutHit = false;
        if (this.options.connectionTimeoutMillis) {
          tid = setTimeout(() => {
            if (client.connection) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.connection.stream.destroy();
            } else if (!client.isConnected()) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.end();
            }
          }, this.options.connectionTimeoutMillis);
        }
        this.log("connecting new client");
        client.connect((err) => {
          if (tid) {
            clearTimeout(tid);
          }
          client.on("error", idleListener);
          if (err) {
            this.log("client failed to connect", err);
            this._clients = this._clients.filter((c) => c !== client);
            if (timeoutHit) {
              err = new Error("Connection terminated due to connection timeout", { cause: err });
            }
            this._pulseQueue();
            if (!pendingItem.timedOut) {
              pendingItem.callback(err, void 0, NOOP);
            }
          } else {
            this.log("new client connected");
            if (this.options.onConnect) {
              this._promiseTry(() => this.options.onConnect(client)).then(
                () => {
                  this._afterConnect(client, pendingItem, idleListener);
                },
                (hookErr) => {
                  this._clients = this._clients.filter((c) => c !== client);
                  client.end(() => {
                    this._pulseQueue();
                    if (!pendingItem.timedOut) {
                      pendingItem.callback(hookErr, void 0, NOOP);
                    }
                  });
                }
              );
              return;
            }
            return this._afterConnect(client, pendingItem, idleListener);
          }
        });
      }
      _afterConnect(client, pendingItem, idleListener) {
        if (this.options.maxLifetimeSeconds !== 0) {
          const maxLifetimeTimeout = setTimeout(() => {
            this.log("ending client due to expired lifetime");
            this._expired.add(client);
            const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client);
            if (idleIndex !== -1) {
              this._acquireClient(
                client,
                new PendingItem((err, client2, clientRelease) => clientRelease()),
                idleListener,
                false
              );
            }
          }, this.options.maxLifetimeSeconds * 1e3);
          maxLifetimeTimeout.unref();
          client.once("end", () => clearTimeout(maxLifetimeTimeout));
        }
        return this._acquireClient(client, pendingItem, idleListener, true);
      }
      // acquire a client for a pending work item
      _acquireClient(client, pendingItem, idleListener, isNew) {
        if (isNew) {
          this.emit("connect", client);
        }
        this.emit("acquire", client);
        client.release = this._releaseOnce(client, idleListener);
        client.removeListener("error", idleListener);
        if (!pendingItem.timedOut) {
          if (isNew && this.options.verify) {
            this.options.verify(client, (err) => {
              if (err) {
                client.release(err);
                return pendingItem.callback(err, void 0, NOOP);
              }
              pendingItem.callback(void 0, client, client.release);
            });
          } else {
            pendingItem.callback(void 0, client, client.release);
          }
        } else {
          if (isNew && this.options.verify) {
            this.options.verify(client, client.release);
          } else {
            client.release();
          }
        }
      }
      // returns a function that wraps _release and throws if called more than once
      _releaseOnce(client, idleListener) {
        let released = false;
        return (err) => {
          if (released) {
            throwOnDoubleRelease();
          }
          released = true;
          this._release(client, idleListener, err);
        };
      }
      // release a client back to the poll, include an error
      // to remove it from the pool
      _release(client, idleListener, err) {
        client.on("error", idleListener);
        client._poolUseCount = (client._poolUseCount || 0) + 1;
        this.emit("release", err, client);
        if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
          if (client._poolUseCount >= this.options.maxUses) {
            this.log("remove expended client");
          }
          return this._remove(client, this._pulseQueue.bind(this));
        }
        const isExpired = this._expired.has(client);
        if (isExpired) {
          this.log("remove expired client");
          this._expired.delete(client);
          return this._remove(client, this._pulseQueue.bind(this));
        }
        let tid;
        if (this.options.idleTimeoutMillis && this._isAboveMin()) {
          tid = setTimeout(() => {
            if (this._isAboveMin()) {
              this.log("remove idle client");
              this._remove(client, this._pulseQueue.bind(this));
            }
          }, this.options.idleTimeoutMillis);
          if (this.options.allowExitOnIdle) {
            tid.unref();
          }
        }
        if (this.options.allowExitOnIdle) {
          client.unref();
        }
        this._idle.push(new IdleItem(client, idleListener, tid));
        this._pulseQueue();
      }
      query(text, values, cb) {
        if (typeof text === "function") {
          const response2 = promisify(this.Promise, text);
          setImmediate(function() {
            return response2.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
          });
          return response2.result;
        }
        if (typeof values === "function") {
          cb = values;
          values = void 0;
        }
        const response = promisify(this.Promise, cb);
        cb = response.callback;
        this.connect((err, client) => {
          if (err) {
            return cb(err);
          }
          let clientReleased = false;
          const onError = /* @__PURE__ */ __name((err2) => {
            if (clientReleased) {
              return;
            }
            clientReleased = true;
            client.release(err2);
            cb(err2);
          }, "onError");
          client.once("error", onError);
          this.log("dispatching query");
          try {
            client.query(text, values, (err2, res) => {
              this.log("query dispatched");
              client.removeListener("error", onError);
              if (clientReleased) {
                return;
              }
              clientReleased = true;
              client.release(err2);
              if (err2) {
                return cb(err2);
              }
              return cb(void 0, res);
            });
          } catch (err2) {
            client.release(err2);
            return cb(err2);
          }
        });
        return response.result;
      }
      end(cb) {
        this.log("ending");
        if (this.ending) {
          const err = new Error("Called end on pool more than once");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        this.ending = true;
        const promised = promisify(this.Promise, cb);
        this._endCallback = promised.callback;
        this._pulseQueue();
        return promised.result;
      }
      get waitingCount() {
        return this._pendingQueue.length;
      }
      get idleCount() {
        return this._idle.length;
      }
      get expiredCount() {
        return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0);
      }
      get totalCount() {
        return this._clients.length;
      }
    };
    module.exports = Pool;
  }
});

// ../node_modules/pg/lib/native/query.js
var require_query2 = __commonJS({
  "../node_modules/pg/lib/native/query.js"(exports, module) {
    "use strict";
    var EventEmitter = require_events().EventEmitter;
    var util = require_util();
    var utils = require_utils();
    var NativeQuery = module.exports = function(config, values, callback) {
      EventEmitter.call(this);
      config = utils.normalizeQueryConfig(config, values, callback);
      this.text = config.text;
      this.values = config.values;
      this.name = config.name;
      this.queryMode = config.queryMode;
      this.callback = config.callback;
      this.state = "new";
      this._arrayMode = config.rowMode === "array";
      this._emitRowEvents = false;
      this.on(
        "newListener",
        function(event) {
          if (event === "row") this._emitRowEvents = true;
        }.bind(this)
      );
    };
    util.inherits(NativeQuery, EventEmitter);
    var errorFieldMap = {
      /* eslint-disable quote-props */
      sqlState: "code",
      statementPosition: "position",
      messagePrimary: "message",
      context: "where",
      schemaName: "schema",
      tableName: "table",
      columnName: "column",
      dataTypeName: "dataType",
      constraintName: "constraint",
      sourceFile: "file",
      sourceLine: "line",
      sourceFunction: "routine"
    };
    NativeQuery.prototype.handleError = function(err) {
      var fields = this.native.pq.resultErrorFields();
      if (fields) {
        for (var key in fields) {
          var normalizedFieldName = errorFieldMap[key] || key;
          err[normalizedFieldName] = fields[key];
        }
      }
      if (this.callback) {
        this.callback(err);
      } else {
        this.emit("error", err);
      }
      this.state = "error";
    };
    NativeQuery.prototype.then = function(onSuccess, onFailure) {
      return this._getPromise().then(onSuccess, onFailure);
    };
    NativeQuery.prototype.catch = function(callback) {
      return this._getPromise().catch(callback);
    };
    NativeQuery.prototype._getPromise = function() {
      if (this._promise) return this._promise;
      this._promise = new Promise(
        function(resolve, reject) {
          this._once("end", resolve);
          this._once("error", reject);
        }.bind(this)
      );
      return this._promise;
    };
    NativeQuery.prototype.submit = function(client) {
      this.state = "running";
      var self2 = this;
      this.native = client.native;
      client.native.arrayMode = this._arrayMode;
      var after = /* @__PURE__ */ __name(function(err, rows, results) {
        client.native.arrayMode = false;
        setImmediate(function() {
          self2.emit("_done");
        });
        if (err) {
          return self2.handleError(err);
        }
        if (self2._emitRowEvents) {
          if (results.length > 1) {
            rows.forEach((rowOfRows, i) => {
              rowOfRows.forEach((row) => {
                self2.emit("row", row, results[i]);
              });
            });
          } else {
            rows.forEach(function(row) {
              self2.emit("row", row, results);
            });
          }
        }
        self2.state = "end";
        self2.emit("end", results);
        if (self2.callback) {
          self2.callback(null, results);
        }
      }, "after");
      if (process.domain) {
        after = process.domain.bind(after);
      }
      if (this.name) {
        if (this.name.length > 63) {
          console.error("Warning! Postgres only supports 63 characters for query names.");
          console.error("You supplied %s (%s)", this.name, this.name.length);
          console.error("This can cause conflicts and silent errors executing queries");
        }
        var values = (this.values || []).map(utils.prepareValue);
        if (client.namedQueries[this.name]) {
          if (this.text && client.namedQueries[this.name] !== this.text) {
            const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
            return after(err);
          }
          return client.native.execute(this.name, values, after);
        }
        return client.native.prepare(this.name, this.text, values.length, function(err) {
          if (err) return after(err);
          client.namedQueries[self2.name] = self2.text;
          return self2.native.execute(self2.name, values, after);
        });
      } else if (this.values) {
        if (!Array.isArray(this.values)) {
          const err = new Error("Query values must be an array");
          return after(err);
        }
        var vals = this.values.map(utils.prepareValue);
        client.native.query(this.text, vals, after);
      } else if (this.queryMode === "extended") {
        client.native.query(this.text, [], after);
      } else {
        client.native.query(this.text, after);
      }
    };
  }
});

// ../node_modules/pg/lib/native/client.js
var require_client2 = __commonJS({
  "../node_modules/pg/lib/native/client.js"(exports, module) {
    "use strict";
    var Native;
    try {
      Native = __require("pg-native");
    } catch (e) {
      throw e;
    }
    var TypeOverrides = require_type_overrides();
    var EventEmitter = require_events().EventEmitter;
    var util = require_util();
    var ConnectionParameters = require_connection_parameters();
    var NativeQuery = require_query2();
    var Client = module.exports = function(config) {
      EventEmitter.call(this);
      config = config || {};
      this._Promise = config.Promise || global.Promise;
      this._types = new TypeOverrides(config.types);
      this.native = new Native({
        types: this._types
      });
      this._queryQueue = [];
      this._ending = false;
      this._connecting = false;
      this._connected = false;
      this._queryable = true;
      var cp = this.connectionParameters = new ConnectionParameters(config);
      if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString;
      this.user = cp.user;
      Object.defineProperty(this, "password", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cp.password
      });
      this.database = cp.database;
      this.host = cp.host;
      this.port = cp.port;
      this.namedQueries = {};
    };
    Client.Query = NativeQuery;
    util.inherits(Client, EventEmitter);
    Client.prototype._errorAllQueries = function(err) {
      const enqueueError = /* @__PURE__ */ __name((query) => {
        process.nextTick(() => {
          query.native = this.native;
          query.handleError(err);
        });
      }, "enqueueError");
      if (this._hasActiveQuery()) {
        enqueueError(this._activeQuery);
        this._activeQuery = null;
      }
      this._queryQueue.forEach(enqueueError);
      this._queryQueue.length = 0;
    };
    Client.prototype._connect = function(cb) {
      var self2 = this;
      if (this._connecting) {
        process.nextTick(() => cb(new Error("Client has already been connected. You cannot reuse a client.")));
        return;
      }
      this._connecting = true;
      this.connectionParameters.getLibpqConnectionString(function(err, conString) {
        if (self2.connectionParameters.nativeConnectionString) conString = self2.connectionParameters.nativeConnectionString;
        if (err) return cb(err);
        self2.native.connect(conString, function(err2) {
          if (err2) {
            self2.native.end();
            return cb(err2);
          }
          self2._connected = true;
          self2.native.on("error", function(err3) {
            self2._queryable = false;
            self2._errorAllQueries(err3);
            self2.emit("error", err3);
          });
          self2.native.on("notification", function(msg) {
            self2.emit("notification", {
              channel: msg.relname,
              payload: msg.extra
            });
          });
          self2.emit("connect");
          self2._pulseQueryQueue(true);
          cb();
        });
      });
    };
    Client.prototype.connect = function(callback) {
      if (callback) {
        this._connect(callback);
        return;
      }
      return new this._Promise((resolve, reject) => {
        this._connect((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    };
    Client.prototype.query = function(config, values, callback) {
      var query;
      var result;
      var readTimeout;
      var readTimeoutTimer;
      var queryCallback;
      if (config === null || config === void 0) {
        throw new TypeError("Client was passed a null or undefined query");
      } else if (typeof config.submit === "function") {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        result = query = config;
        if (typeof values === "function") {
          config.callback = values;
        }
      } else {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        query = new NativeQuery(config, values, callback);
        if (!query.callback) {
          let resolveOut, rejectOut;
          result = new this._Promise((resolve, reject) => {
            resolveOut = resolve;
            rejectOut = reject;
          }).catch((err) => {
            Error.captureStackTrace(err);
            throw err;
          });
          query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res);
        }
      }
      if (readTimeout) {
        queryCallback = query.callback;
        readTimeoutTimer = setTimeout(() => {
          var error = new Error("Query read timeout");
          process.nextTick(() => {
            query.handleError(error, this.connection);
          });
          queryCallback(error);
          query.callback = () => {
          };
          var index = this._queryQueue.indexOf(query);
          if (index > -1) {
            this._queryQueue.splice(index, 1);
          }
          this._pulseQueryQueue();
        }, readTimeout);
        query.callback = (err, res) => {
          clearTimeout(readTimeoutTimer);
          queryCallback(err, res);
        };
      }
      if (!this._queryable) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client has encountered a connection error and is not queryable"));
        });
        return result;
      }
      if (this._ending) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client was closed and is not queryable"));
        });
        return result;
      }
      this._queryQueue.push(query);
      this._pulseQueryQueue();
      return result;
    };
    Client.prototype.end = function(cb) {
      var self2 = this;
      this._ending = true;
      if (!this._connected) {
        this.once("connect", this.end.bind(this, cb));
      }
      var result;
      if (!cb) {
        result = new this._Promise(function(resolve, reject) {
          cb = /* @__PURE__ */ __name((err) => err ? reject(err) : resolve(), "cb");
        });
      }
      this.native.end(function() {
        self2._errorAllQueries(new Error("Connection terminated"));
        process.nextTick(() => {
          self2.emit("end");
          if (cb) cb();
        });
      });
      return result;
    };
    Client.prototype._hasActiveQuery = function() {
      return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
    };
    Client.prototype._pulseQueryQueue = function(initialConnection) {
      if (!this._connected) {
        return;
      }
      if (this._hasActiveQuery()) {
        return;
      }
      var query = this._queryQueue.shift();
      if (!query) {
        if (!initialConnection) {
          this.emit("drain");
        }
        return;
      }
      this._activeQuery = query;
      query.submit(this);
      var self2 = this;
      query.once("_done", function() {
        self2._pulseQueryQueue();
      });
    };
    Client.prototype.cancel = function(query) {
      if (this._activeQuery === query) {
        this.native.cancel(function() {
        });
      } else if (this._queryQueue.indexOf(query) !== -1) {
        this._queryQueue.splice(this._queryQueue.indexOf(query), 1);
      }
    };
    Client.prototype.ref = function() {
    };
    Client.prototype.unref = function() {
    };
    Client.prototype.setTypeParser = function(oid, format, parseFn) {
      return this._types.setTypeParser(oid, format, parseFn);
    };
    Client.prototype.getTypeParser = function(oid, format) {
      return this._types.getTypeParser(oid, format);
    };
  }
});

// ../node_modules/pg/lib/native/index.js
var require_native = __commonJS({
  "../node_modules/pg/lib/native/index.js"(exports, module) {
    "use strict";
    module.exports = require_client2();
  }
});

// ../node_modules/pg/lib/index.js
var require_lib2 = __commonJS({
  "../node_modules/pg/lib/index.js"(exports, module) {
    "use strict";
    var Client = require_client();
    var defaults = require_defaults();
    var Connection = require_connection();
    var Pool = require_pg_pool();
    var { DatabaseError } = require_dist();
    var { escapeIdentifier, escapeLiteral } = require_utils();
    var poolFactory = /* @__PURE__ */ __name((Client2) => {
      return class BoundPool extends Pool {
        static {
          __name(this, "BoundPool");
        }
        constructor(options) {
          super(options, Client2);
        }
      };
    }, "poolFactory");
    var PG = /* @__PURE__ */ __name(function(clientConstructor) {
      this.defaults = defaults;
      this.Client = clientConstructor;
      this.Query = this.Client.Query;
      this.Pool = poolFactory(this.Client);
      this._pools = [];
      this.Connection = Connection;
      this.types = require_pg_types();
      this.DatabaseError = DatabaseError;
      this.escapeIdentifier = escapeIdentifier;
      this.escapeLiteral = escapeLiteral;
    }, "PG");
    if (typeof process.env.NODE_PG_FORCE_NATIVE !== "undefined") {
      module.exports = new PG(require_native());
    } else {
      module.exports = new PG(Client);
      Object.defineProperty(module.exports, "native", {
        configurable: true,
        enumerable: false,
        get() {
          var native = null;
          try {
            native = new PG(require_native());
          } catch (err) {
            if (err.code !== "MODULE_NOT_FOUND") {
              throw err;
            }
          }
          Object.defineProperty(module.exports, "native", {
            value: native
          });
          return native;
        }
      });
    }
  }
});

// ../node_modules/postgres-array/index.js
var require_postgres_array2 = __commonJS({
  "../node_modules/postgres-array/index.js"(exports) {
    "use strict";
    var BACKSLASH = "\\";
    var DQUOT = '"';
    var LBRACE = "{";
    var RBRACE = "}";
    var LBRACKET = "[";
    var EQUALS = "=";
    var COMMA = ",";
    var NULL_STRING = "NULL";
    function makeParseArrayWithTransform(transform) {
      const haveTransform = transform != null;
      return /* @__PURE__ */ __name(function parseArray3(str) {
        const rbraceIndex = str.length - 1;
        if (rbraceIndex === 1) {
          return [];
        }
        if (str[rbraceIndex] !== RBRACE) {
          throw new Error("Invalid array text - must end with }");
        }
        let position = 0;
        if (str[position] === LBRACKET) {
          position = str.indexOf(EQUALS) + 1;
        }
        if (str[position++] !== LBRACE) {
          throw new Error("Invalid array text - must start with {");
        }
        const output = [];
        let current = output;
        const stack = [];
        let currentStringStart = position;
        let currentString = "";
        let expectValue = true;
        for (; position < rbraceIndex; ++position) {
          let char = str[position];
          if (char === DQUOT) {
            currentStringStart = ++position;
            let dquot = str.indexOf(DQUOT, currentStringStart);
            let backSlash = str.indexOf(BACKSLASH, currentStringStart);
            while (backSlash !== -1 && backSlash < dquot) {
              position = backSlash;
              const part2 = str.slice(currentStringStart, position);
              currentString += part2;
              currentStringStart = ++position;
              if (dquot === position++) {
                dquot = str.indexOf(DQUOT, position);
              }
              backSlash = str.indexOf(BACKSLASH, position);
            }
            position = dquot;
            const part = str.slice(currentStringStart, position);
            currentString += part;
            current.push(haveTransform ? transform(currentString) : currentString);
            currentString = "";
            expectValue = false;
          } else if (char === LBRACE) {
            const newArray = [];
            current.push(newArray);
            stack.push(current);
            current = newArray;
            currentStringStart = position + 1;
            expectValue = true;
          } else if (char === COMMA) {
            expectValue = true;
          } else if (char === RBRACE) {
            expectValue = false;
            const arr = stack.pop();
            if (arr === void 0) {
              throw new Error("Invalid array text - too many '}'");
            }
            current = arr;
          } else if (expectValue) {
            currentStringStart = position;
            while ((char = str[position]) !== COMMA && char !== RBRACE && position < rbraceIndex) {
              ++position;
            }
            const part = str.slice(currentStringStart, position--);
            current.push(
              part === NULL_STRING ? null : haveTransform ? transform(part) : part
            );
            expectValue = false;
          } else {
            throw new Error("Was expecting delimeter");
          }
        }
        return output;
      }, "parseArray");
    }
    __name(makeParseArrayWithTransform, "makeParseArrayWithTransform");
    var parseArray2 = makeParseArrayWithTransform();
    exports.parse = (source, transform) => transform != null ? makeParseArrayWithTransform(transform)(source) : parseArray2(source);
  }
});

// ../node_modules/@prisma/client/runtime/wasm-engine-edge.js
var require_wasm_engine_edge = __commonJS({
  "../node_modules/@prisma/client/runtime/wasm-engine-edge.js"(exports, module) {
    "use strict";
    var Vs = Object.create;
    var nr = Object.defineProperty;
    var Bs = Object.getOwnPropertyDescriptor;
    var $s = Object.getOwnPropertyNames;
    var js = Object.getPrototypeOf;
    var Qs = Object.prototype.hasOwnProperty;
    var ae = /* @__PURE__ */ __name((t, e) => () => (t && (e = t(t = 0)), e), "ae");
    var yt = /* @__PURE__ */ __name((t, e) => () => (e || t((e = { exports: {} }).exports, e), e.exports), "yt");
    var ht = /* @__PURE__ */ __name((t, e) => {
      for (var r in e) nr(t, r, { get: e[r], enumerable: true });
    }, "ht");
    var Hn = /* @__PURE__ */ __name((t, e, r, n) => {
      if (e && typeof e == "object" || typeof e == "function") for (let i of $s(e)) !Qs.call(t, i) && i !== r && nr(t, i, { get: /* @__PURE__ */ __name(() => e[i], "get"), enumerable: !(n = Bs(e, i)) || n.enumerable });
      return t;
    }, "Hn");
    var bt = /* @__PURE__ */ __name((t, e, r) => (r = t != null ? Vs(js(t)) : {}, Hn(e || !t || !t.__esModule ? nr(r, "default", { value: t, enumerable: true }) : r, t)), "bt");
    var Gs = /* @__PURE__ */ __name((t) => Hn(nr({}, "__esModule", { value: true }), t), "Gs");
    function Kr(t, e) {
      if (e = e.toLowerCase(), e === "utf8" || e === "utf-8") return new y(Hs.encode(t));
      if (e === "base64" || e === "base64url") return t = t.replace(/-/g, "+").replace(/_/g, "/"), t = t.replace(/[^A-Za-z0-9+/]/g, ""), new y([...atob(t)].map((r) => r.charCodeAt(0)));
      if (e === "binary" || e === "ascii" || e === "latin1" || e === "latin-1") return new y([...t].map((r) => r.charCodeAt(0)));
      if (e === "ucs2" || e === "ucs-2" || e === "utf16le" || e === "utf-16le") {
        let r = new y(t.length * 2), n = new DataView(r.buffer);
        for (let i = 0; i < t.length; i++) n.setUint16(i * 2, t.charCodeAt(i), true);
        return r;
      }
      if (e === "hex") {
        let r = new y(t.length / 2);
        for (let n = 0, i = 0; i < t.length; i += 2, n++) r[n] = parseInt(t.slice(i, i + 2), 16);
        return r;
      }
      Yn(`encoding "${e}"`);
    }
    __name(Kr, "Kr");
    function Js(t) {
      let r = Object.getOwnPropertyNames(DataView.prototype).filter((a) => a.startsWith("get") || a.startsWith("set")), n = r.map((a) => a.replace("get", "read").replace("set", "write")), i = /* @__PURE__ */ __name((a, f) => function(v = 0) {
        return J(v, "offset"), re(v, "offset"), K(v, "offset", this.length - 1), new DataView(this.buffer)[r[a]](v, f);
      }, "i"), o = /* @__PURE__ */ __name((a, f) => function(v, R = 0) {
        let A = r[a].match(/set(\w+\d+)/)[1].toLowerCase(), I = Ks[A];
        return J(R, "offset"), re(R, "offset"), K(R, "offset", this.length - 1), Ws(v, "value", I[0], I[1]), new DataView(this.buffer)[r[a]](R, v, f), R + parseInt(r[a].match(/\d+/)[0]) / 8;
      }, "o"), s = /* @__PURE__ */ __name((a) => {
        a.forEach((f) => {
          f.includes("Uint") && (t[f.replace("Uint", "UInt")] = t[f]), f.includes("Float64") && (t[f.replace("Float64", "Double")] = t[f]), f.includes("Float32") && (t[f.replace("Float32", "Float")] = t[f]);
        });
      }, "s");
      n.forEach((a, f) => {
        a.startsWith("read") && (t[a] = i(f, false), t[a + "LE"] = i(f, true), t[a + "BE"] = i(f, false)), a.startsWith("write") && (t[a] = o(f, false), t[a + "LE"] = o(f, true), t[a + "BE"] = o(f, false)), s([a, a + "LE", a + "BE"]);
      });
    }
    __name(Js, "Js");
    function Yn(t) {
      throw new Error(`Buffer polyfill does not implement "${t}"`);
    }
    __name(Yn, "Yn");
    function ir(t, e) {
      if (!(t instanceof Uint8Array)) throw new TypeError(`The "${e}" argument must be an instance of Buffer or Uint8Array`);
    }
    __name(ir, "ir");
    function K(t, e, r = Xs + 1) {
      if (t < 0 || t > r) {
        let n = new RangeError(`The value of "${e}" is out of range. It must be >= 0 && <= ${r}. Received ${t}`);
        throw n.code = "ERR_OUT_OF_RANGE", n;
      }
    }
    __name(K, "K");
    function J(t, e) {
      if (typeof t != "number") {
        let r = new TypeError(`The "${e}" argument must be of type number. Received type ${typeof t}.`);
        throw r.code = "ERR_INVALID_ARG_TYPE", r;
      }
    }
    __name(J, "J");
    function re(t, e) {
      if (!Number.isInteger(t) || Number.isNaN(t)) {
        let r = new RangeError(`The value of "${e}" is out of range. It must be an integer. Received ${t}`);
        throw r.code = "ERR_OUT_OF_RANGE", r;
      }
    }
    __name(re, "re");
    function Ws(t, e, r, n) {
      if (t < r || t > n) {
        let i = new RangeError(`The value of "${e}" is out of range. It must be >= ${r} and <= ${n}. Received ${t}`);
        throw i.code = "ERR_OUT_OF_RANGE", i;
      }
    }
    __name(Ws, "Ws");
    function zn(t, e) {
      if (typeof t != "string") {
        let r = new TypeError(`The "${e}" argument must be of type string. Received type ${typeof t}`);
        throw r.code = "ERR_INVALID_ARG_TYPE", r;
      }
    }
    __name(zn, "zn");
    function Zs(t, e = "utf8") {
      return y.from(t, e);
    }
    __name(Zs, "Zs");
    var y;
    var Ks;
    var Hs;
    var zs;
    var Ys;
    var Xs;
    var h;
    var Hr;
    var u = ae(() => {
      "use strict";
      y = class t extends Uint8Array {
        static {
          __name(this, "t");
        }
        _isBuffer = true;
        get offset() {
          return this.byteOffset;
        }
        static alloc(e, r = 0, n = "utf8") {
          return zn(n, "encoding"), t.allocUnsafe(e).fill(r, n);
        }
        static allocUnsafe(e) {
          return t.from(e);
        }
        static allocUnsafeSlow(e) {
          return t.from(e);
        }
        static isBuffer(e) {
          return e && !!e._isBuffer;
        }
        static byteLength(e, r = "utf8") {
          if (typeof e == "string") return Kr(e, r).byteLength;
          if (e && e.byteLength) return e.byteLength;
          let n = new TypeError('The "string" argument must be of type string or an instance of Buffer or ArrayBuffer.');
          throw n.code = "ERR_INVALID_ARG_TYPE", n;
        }
        static isEncoding(e) {
          return Ys.includes(e);
        }
        static compare(e, r) {
          ir(e, "buff1"), ir(r, "buff2");
          for (let n = 0; n < e.length; n++) {
            if (e[n] < r[n]) return -1;
            if (e[n] > r[n]) return 1;
          }
          return e.length === r.length ? 0 : e.length > r.length ? 1 : -1;
        }
        static from(e, r = "utf8") {
          if (e && typeof e == "object" && e.type === "Buffer") return new t(e.data);
          if (typeof e == "number") return new t(new Uint8Array(e));
          if (typeof e == "string") return Kr(e, r);
          if (ArrayBuffer.isView(e)) {
            let { byteOffset: n, byteLength: i, buffer: o } = e;
            return "map" in e && typeof e.map == "function" ? new t(e.map((s) => s % 256), n, i) : new t(o, n, i);
          }
          if (e && typeof e == "object" && ("length" in e || "byteLength" in e || "buffer" in e)) return new t(e);
          throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.");
        }
        static concat(e, r) {
          if (e.length === 0) return t.alloc(0);
          let n = [].concat(...e.map((o) => [...o])), i = t.alloc(r !== void 0 ? r : n.length);
          return i.set(r !== void 0 ? n.slice(0, r) : n), i;
        }
        slice(e = 0, r = this.length) {
          return this.subarray(e, r);
        }
        subarray(e = 0, r = this.length) {
          return Object.setPrototypeOf(super.subarray(e, r), t.prototype);
        }
        reverse() {
          return super.reverse(), this;
        }
        readIntBE(e, r) {
          J(e, "offset"), re(e, "offset"), K(e, "offset", this.length - 1), J(r, "byteLength"), re(r, "byteLength");
          let n = new DataView(this.buffer, e, r), i = 0;
          for (let o = 0; o < r; o++) i = i * 256 + n.getUint8(o);
          return n.getUint8(0) & 128 && (i -= Math.pow(256, r)), i;
        }
        readIntLE(e, r) {
          J(e, "offset"), re(e, "offset"), K(e, "offset", this.length - 1), J(r, "byteLength"), re(r, "byteLength");
          let n = new DataView(this.buffer, e, r), i = 0;
          for (let o = 0; o < r; o++) i += n.getUint8(o) * Math.pow(256, o);
          return n.getUint8(r - 1) & 128 && (i -= Math.pow(256, r)), i;
        }
        readUIntBE(e, r) {
          J(e, "offset"), re(e, "offset"), K(e, "offset", this.length - 1), J(r, "byteLength"), re(r, "byteLength");
          let n = new DataView(this.buffer, e, r), i = 0;
          for (let o = 0; o < r; o++) i = i * 256 + n.getUint8(o);
          return i;
        }
        readUintBE(e, r) {
          return this.readUIntBE(e, r);
        }
        readUIntLE(e, r) {
          J(e, "offset"), re(e, "offset"), K(e, "offset", this.length - 1), J(r, "byteLength"), re(r, "byteLength");
          let n = new DataView(this.buffer, e, r), i = 0;
          for (let o = 0; o < r; o++) i += n.getUint8(o) * Math.pow(256, o);
          return i;
        }
        readUintLE(e, r) {
          return this.readUIntLE(e, r);
        }
        writeIntBE(e, r, n) {
          return e = e < 0 ? e + Math.pow(256, n) : e, this.writeUIntBE(e, r, n);
        }
        writeIntLE(e, r, n) {
          return e = e < 0 ? e + Math.pow(256, n) : e, this.writeUIntLE(e, r, n);
        }
        writeUIntBE(e, r, n) {
          J(r, "offset"), re(r, "offset"), K(r, "offset", this.length - 1), J(n, "byteLength"), re(n, "byteLength");
          let i = new DataView(this.buffer, r, n);
          for (let o = n - 1; o >= 0; o--) i.setUint8(o, e & 255), e = e / 256;
          return r + n;
        }
        writeUintBE(e, r, n) {
          return this.writeUIntBE(e, r, n);
        }
        writeUIntLE(e, r, n) {
          J(r, "offset"), re(r, "offset"), K(r, "offset", this.length - 1), J(n, "byteLength"), re(n, "byteLength");
          let i = new DataView(this.buffer, r, n);
          for (let o = 0; o < n; o++) i.setUint8(o, e & 255), e = e / 256;
          return r + n;
        }
        writeUintLE(e, r, n) {
          return this.writeUIntLE(e, r, n);
        }
        toJSON() {
          return { type: "Buffer", data: Array.from(this) };
        }
        swap16() {
          let e = new DataView(this.buffer, this.byteOffset, this.byteLength);
          for (let r = 0; r < this.length; r += 2) e.setUint16(r, e.getUint16(r, true), false);
          return this;
        }
        swap32() {
          let e = new DataView(this.buffer, this.byteOffset, this.byteLength);
          for (let r = 0; r < this.length; r += 4) e.setUint32(r, e.getUint32(r, true), false);
          return this;
        }
        swap64() {
          let e = new DataView(this.buffer, this.byteOffset, this.byteLength);
          for (let r = 0; r < this.length; r += 8) e.setBigUint64(r, e.getBigUint64(r, true), false);
          return this;
        }
        compare(e, r = 0, n = e.length, i = 0, o = this.length) {
          return ir(e, "target"), J(r, "targetStart"), J(n, "targetEnd"), J(i, "sourceStart"), J(o, "sourceEnd"), K(r, "targetStart"), K(n, "targetEnd", e.length), K(i, "sourceStart"), K(o, "sourceEnd", this.length), t.compare(this.slice(i, o), e.slice(r, n));
        }
        equals(e) {
          return ir(e, "otherBuffer"), this.length === e.length && this.every((r, n) => r === e[n]);
        }
        copy(e, r = 0, n = 0, i = this.length) {
          K(r, "targetStart"), K(n, "sourceStart", this.length), K(i, "sourceEnd"), r >>>= 0, n >>>= 0, i >>>= 0;
          let o = 0;
          for (; n < i && !(this[n] === void 0 || e[r] === void 0); ) e[r] = this[n], o++, n++, r++;
          return o;
        }
        write(e, r, n, i = "utf8") {
          let o = typeof r == "string" ? 0 : r ?? 0, s = typeof n == "string" ? this.length - o : n ?? this.length - o;
          return i = typeof r == "string" ? r : typeof n == "string" ? n : i, J(o, "offset"), J(s, "length"), K(o, "offset", this.length), K(s, "length", this.length), (i === "ucs2" || i === "ucs-2" || i === "utf16le" || i === "utf-16le") && (s = s - s % 2), Kr(e, i).copy(this, o, 0, s);
        }
        fill(e = 0, r = 0, n = this.length, i = "utf-8") {
          let o = typeof r == "string" ? 0 : r, s = typeof n == "string" ? this.length : n;
          if (i = typeof r == "string" ? r : typeof n == "string" ? n : i, e = t.from(typeof e == "number" ? [e] : e ?? [], i), zn(i, "encoding"), K(o, "offset", this.length), K(s, "end", this.length), e.length !== 0) for (let a = o; a < s; a += e.length) super.set(e.slice(0, e.length + a >= this.length ? this.length - a : e.length), a);
          return this;
        }
        includes(e, r = null, n = "utf-8") {
          return this.indexOf(e, r, n) !== -1;
        }
        lastIndexOf(e, r = null, n = "utf-8") {
          return this.indexOf(e, r, n, true);
        }
        indexOf(e, r = null, n = "utf-8", i = false) {
          let o = i ? this.findLastIndex.bind(this) : this.findIndex.bind(this);
          n = typeof r == "string" ? r : n;
          let s = t.from(typeof e == "number" ? [e] : e, n), a = typeof r == "string" ? 0 : r;
          return a = typeof r == "number" ? a : null, a = Number.isNaN(a) ? null : a, a ??= i ? this.length : 0, a = a < 0 ? this.length + a : a, s.length === 0 && i === false ? a >= this.length ? this.length : a : s.length === 0 && i === true ? (a >= this.length ? this.length : a) || this.length : o((f, v) => (i ? v <= a : v >= a) && this[v] === s[0] && s.every((A, I) => this[v + I] === A));
        }
        toString(e = "utf8", r = 0, n = this.length) {
          if (r = r < 0 ? 0 : r, e = e.toString().toLowerCase(), n <= 0) return "";
          if (e === "utf8" || e === "utf-8") return zs.decode(this.slice(r, n));
          if (e === "base64" || e === "base64url") {
            let i = btoa(this.reduce((o, s) => o + Hr(s), ""));
            return e === "base64url" ? i.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : i;
          }
          if (e === "binary" || e === "ascii" || e === "latin1" || e === "latin-1") return this.slice(r, n).reduce((i, o) => i + Hr(o & (e === "ascii" ? 127 : 255)), "");
          if (e === "ucs2" || e === "ucs-2" || e === "utf16le" || e === "utf-16le") {
            let i = new DataView(this.buffer.slice(r, n));
            return Array.from({ length: i.byteLength / 2 }, (o, s) => s * 2 + 1 < i.byteLength ? Hr(i.getUint16(s * 2, true)) : "").join("");
          }
          if (e === "hex") return this.slice(r, n).reduce((i, o) => i + o.toString(16).padStart(2, "0"), "");
          Yn(`encoding "${e}"`);
        }
        toLocaleString() {
          return this.toString();
        }
        inspect() {
          return `<Buffer ${this.toString("hex").match(/.{1,2}/g).join(" ")}>`;
        }
      };
      Ks = { int8: [-128, 127], int16: [-32768, 32767], int32: [-2147483648, 2147483647], uint8: [0, 255], uint16: [0, 65535], uint32: [0, 4294967295], float32: [-1 / 0, 1 / 0], float64: [-1 / 0, 1 / 0], bigint64: [-0x8000000000000000n, 0x7fffffffffffffffn], biguint64: [0n, 0xffffffffffffffffn] }, Hs = new TextEncoder(), zs = new TextDecoder(), Ys = ["utf8", "utf-8", "hex", "base64", "ascii", "binary", "base64url", "ucs2", "ucs-2", "utf16le", "utf-16le", "latin1", "latin-1"], Xs = 4294967295;
      Js(y.prototype);
      h = new Proxy(Zs, { construct(t, [e, r]) {
        return y.from(e, r);
      }, get(t, e) {
        return y[e];
      } }), Hr = String.fromCodePoint;
    });
    var g;
    var w;
    var c = ae(() => {
      "use strict";
      g = { nextTick: /* @__PURE__ */ __name((t, ...e) => {
        setTimeout(() => {
          t(...e);
        }, 0);
      }, "nextTick"), env: {}, version: "", cwd: /* @__PURE__ */ __name(() => "/", "cwd"), stderr: {}, argv: ["/bin/node"], pid: 1e4 }, { cwd: w } = g;
    });
    var x;
    var p = ae(() => {
      "use strict";
      x = globalThis.performance ?? (() => {
        let t = Date.now();
        return { now: /* @__PURE__ */ __name(() => Date.now() - t, "now") };
      })();
    });
    var E;
    var m = ae(() => {
      "use strict";
      E = /* @__PURE__ */ __name(() => {
      }, "E");
      E.prototype = E;
    });
    var b;
    var d = ae(() => {
      "use strict";
      b = class {
        static {
          __name(this, "b");
        }
        value;
        constructor(e) {
          this.value = e;
        }
        deref() {
          return this.value;
        }
      };
    });
    function ti(t, e) {
      var r, n, i, o, s, a, f, v, R = t.constructor, A = R.precision;
      if (!t.s || !e.s) return e.s || (e = new R(t)), $2 ? N(e, A) : e;
      if (f = t.d, v = e.d, s = t.e, i = e.e, f = f.slice(), o = s - i, o) {
        for (o < 0 ? (n = f, o = -o, a = v.length) : (n = v, i = s, a = f.length), s = Math.ceil(A / B), a = s > a ? s + 1 : a + 1, o > a && (o = a, n.length = 1), n.reverse(); o--; ) n.push(0);
        n.reverse();
      }
      for (a = f.length, o = v.length, a - o < 0 && (o = a, n = v, v = f, f = n), r = 0; o; ) r = (f[--o] = f[o] + v[o] + r) / H | 0, f[o] %= H;
      for (r && (f.unshift(r), ++i), a = f.length; f[--a] == 0; ) f.pop();
      return e.d = f, e.e = i, $2 ? N(e, A) : e;
    }
    __name(ti, "ti");
    function de(t, e, r) {
      if (t !== ~~t || t < e || t > r) throw Error(_e + t);
    }
    __name(de, "de");
    function me(t) {
      var e, r, n, i = t.length - 1, o = "", s = t[0];
      if (i > 0) {
        for (o += s, e = 1; e < i; e++) n = t[e] + "", r = B - n.length, r && (o += Ae(r)), o += n;
        s = t[e], n = s + "", r = B - n.length, r && (o += Ae(r));
      } else if (s === 0) return "0";
      for (; s % 10 === 0; ) s /= 10;
      return o + s;
    }
    __name(me, "me");
    function ri(t, e) {
      var r, n, i, o, s, a, f = 0, v = 0, R = t.constructor, A = R.precision;
      if (W(t) > 16) throw Error(Yr + W(t));
      if (!t.s) return new R(oe);
      for (e == null ? ($2 = false, a = A) : a = e, s = new R(0.03125); t.abs().gte(0.1); ) t = t.times(s), v += 5;
      for (n = Math.log(ke(2, v)) / Math.LN10 * 2 + 5 | 0, a += n, r = i = o = new R(oe), R.precision = a; ; ) {
        if (i = N(i.times(t), a), r = r.times(++f), s = o.plus(we(i, r, a)), me(s.d).slice(0, a) === me(o.d).slice(0, a)) {
          for (; v--; ) o = N(o.times(o), a);
          return R.precision = A, e == null ? ($2 = true, N(o, A)) : o;
        }
        o = s;
      }
    }
    __name(ri, "ri");
    function W(t) {
      for (var e = t.e * B, r = t.d[0]; r >= 10; r /= 10) e++;
      return e;
    }
    __name(W, "W");
    function zr(t, e, r) {
      if (e > t.LN10.sd()) throw $2 = true, r && (t.precision = r), Error(le + "LN10 precision limit exceeded");
      return N(new t(t.LN10), e);
    }
    __name(zr, "zr");
    function Ae(t) {
      for (var e = ""; t--; ) e += "0";
      return e;
    }
    __name(Ae, "Ae");
    function Et(t, e) {
      var r, n, i, o, s, a, f, v, R, A = 1, I = 10, C = t, L = C.d, D = C.constructor, k = D.precision;
      if (C.s < 1) throw Error(le + (C.s ? "NaN" : "-Infinity"));
      if (C.eq(oe)) return new D(0);
      if (e == null ? ($2 = false, v = k) : v = e, C.eq(10)) return e == null && ($2 = true), zr(D, v);
      if (v += I, D.precision = v, r = me(L), n = r.charAt(0), o = W(C), Math.abs(o) < 15e14) {
        for (; n < 7 && n != 1 || n == 1 && r.charAt(1) > 3; ) C = C.times(t), r = me(C.d), n = r.charAt(0), A++;
        o = W(C), n > 1 ? (C = new D("0." + r), o++) : C = new D(n + "." + r.slice(1));
      } else return f = zr(D, v + 2, k).times(o + ""), C = Et(new D(n + "." + r.slice(1)), v - I).plus(f), D.precision = k, e == null ? ($2 = true, N(C, k)) : C;
      for (a = s = C = we(C.minus(oe), C.plus(oe), v), R = N(C.times(C), v), i = 3; ; ) {
        if (s = N(s.times(R), v), f = a.plus(we(s, new D(i), v)), me(f.d).slice(0, v) === me(a.d).slice(0, v)) return a = a.times(2), o !== 0 && (a = a.plus(zr(D, v + 2, k).times(o + ""))), a = we(a, new D(A), v), D.precision = k, e == null ? ($2 = true, N(a, k)) : a;
        a = f, i += 2;
      }
    }
    __name(Et, "Et");
    function Xn(t, e) {
      var r, n, i;
      for ((r = e.indexOf(".")) > -1 && (e = e.replace(".", "")), (n = e.search(/e/i)) > 0 ? (r < 0 && (r = n), r += +e.slice(n + 1), e = e.substring(0, n)) : r < 0 && (r = e.length), n = 0; e.charCodeAt(n) === 48; ) ++n;
      for (i = e.length; e.charCodeAt(i - 1) === 48; ) --i;
      if (e = e.slice(n, i), e) {
        if (i -= n, r = r - n - 1, t.e = Qe(r / B), t.d = [], n = (r + 1) % B, r < 0 && (n += B), n < i) {
          for (n && t.d.push(+e.slice(0, n)), i -= B; n < i; ) t.d.push(+e.slice(n, n += B));
          e = e.slice(n), n = B - e.length;
        } else n -= i;
        for (; n--; ) e += "0";
        if (t.d.push(+e), $2 && (t.e > or || t.e < -or)) throw Error(Yr + r);
      } else t.s = 0, t.e = 0, t.d = [0];
      return t;
    }
    __name(Xn, "Xn");
    function N(t, e, r) {
      var n, i, o, s, a, f, v, R, A = t.d;
      for (s = 1, o = A[0]; o >= 10; o /= 10) s++;
      if (n = e - s, n < 0) n += B, i = e, v = A[R = 0];
      else {
        if (R = Math.ceil((n + 1) / B), o = A.length, R >= o) return t;
        for (v = o = A[R], s = 1; o >= 10; o /= 10) s++;
        n %= B, i = n - B + s;
      }
      if (r !== void 0 && (o = ke(10, s - i - 1), a = v / o % 10 | 0, f = e < 0 || A[R + 1] !== void 0 || v % o, f = r < 4 ? (a || f) && (r == 0 || r == (t.s < 0 ? 3 : 2)) : a > 5 || a == 5 && (r == 4 || f || r == 6 && (n > 0 ? i > 0 ? v / ke(10, s - i) : 0 : A[R - 1]) % 10 & 1 || r == (t.s < 0 ? 8 : 7))), e < 1 || !A[0]) return f ? (o = W(t), A.length = 1, e = e - o - 1, A[0] = ke(10, (B - e % B) % B), t.e = Qe(-e / B) || 0) : (A.length = 1, A[0] = t.e = t.s = 0), t;
      if (n == 0 ? (A.length = R, o = 1, R--) : (A.length = R + 1, o = ke(10, B - n), A[R] = i > 0 ? (v / ke(10, s - i) % ke(10, i) | 0) * o : 0), f) for (; ; ) if (R == 0) {
        (A[0] += o) == H && (A[0] = 1, ++t.e);
        break;
      } else {
        if (A[R] += o, A[R] != H) break;
        A[R--] = 0, o = 1;
      }
      for (n = A.length; A[--n] === 0; ) A.pop();
      if ($2 && (t.e > or || t.e < -or)) throw Error(Yr + W(t));
      return t;
    }
    __name(N, "N");
    function ni(t, e) {
      var r, n, i, o, s, a, f, v, R, A, I = t.constructor, C = I.precision;
      if (!t.s || !e.s) return e.s ? e.s = -e.s : e = new I(t), $2 ? N(e, C) : e;
      if (f = t.d, A = e.d, n = e.e, v = t.e, f = f.slice(), s = v - n, s) {
        for (R = s < 0, R ? (r = f, s = -s, a = A.length) : (r = A, n = v, a = f.length), i = Math.max(Math.ceil(C / B), a) + 2, s > i && (s = i, r.length = 1), r.reverse(), i = s; i--; ) r.push(0);
        r.reverse();
      } else {
        for (i = f.length, a = A.length, R = i < a, R && (a = i), i = 0; i < a; i++) if (f[i] != A[i]) {
          R = f[i] < A[i];
          break;
        }
        s = 0;
      }
      for (R && (r = f, f = A, A = r, e.s = -e.s), a = f.length, i = A.length - a; i > 0; --i) f[a++] = 0;
      for (i = A.length; i > s; ) {
        if (f[--i] < A[i]) {
          for (o = i; o && f[--o] === 0; ) f[o] = H - 1;
          --f[o], f[i] += H;
        }
        f[i] -= A[i];
      }
      for (; f[--a] === 0; ) f.pop();
      for (; f[0] === 0; f.shift()) --n;
      return f[0] ? (e.d = f, e.e = n, $2 ? N(e, C) : e) : new I(0);
    }
    __name(ni, "ni");
    function Me(t, e, r) {
      var n, i = W(t), o = me(t.d), s = o.length;
      return e ? (r && (n = r - s) > 0 ? o = o.charAt(0) + "." + o.slice(1) + Ae(n) : s > 1 && (o = o.charAt(0) + "." + o.slice(1)), o = o + (i < 0 ? "e" : "e+") + i) : i < 0 ? (o = "0." + Ae(-i - 1) + o, r && (n = r - s) > 0 && (o += Ae(n))) : i >= s ? (o += Ae(i + 1 - s), r && (n = r - i - 1) > 0 && (o = o + "." + Ae(n))) : ((n = i + 1) < s && (o = o.slice(0, n) + "." + o.slice(n)), r && (n = r - s) > 0 && (i + 1 === s && (o += "."), o += Ae(n))), t.s < 0 ? "-" + o : o;
    }
    __name(Me, "Me");
    function Zn(t, e) {
      if (t.length > e) return t.length = e, true;
    }
    __name(Zn, "Zn");
    function ii(t) {
      var e, r, n;
      function i(o) {
        var s = this;
        if (!(s instanceof i)) return new i(o);
        if (s.constructor = i, o instanceof i) {
          s.s = o.s, s.e = o.e, s.d = (o = o.d) ? o.slice() : o;
          return;
        }
        if (typeof o == "number") {
          if (o * 0 !== 0) throw Error(_e + o);
          if (o > 0) s.s = 1;
          else if (o < 0) o = -o, s.s = -1;
          else {
            s.s = 0, s.e = 0, s.d = [0];
            return;
          }
          if (o === ~~o && o < 1e7) {
            s.e = 0, s.d = [o];
            return;
          }
          return Xn(s, o.toString());
        } else if (typeof o != "string") throw Error(_e + o);
        if (o.charCodeAt(0) === 45 ? (o = o.slice(1), s.s = -1) : s.s = 1, ta.test(o)) Xn(s, o);
        else throw Error(_e + o);
      }
      __name(i, "i");
      if (i.prototype = S, i.ROUND_UP = 0, i.ROUND_DOWN = 1, i.ROUND_CEIL = 2, i.ROUND_FLOOR = 3, i.ROUND_HALF_UP = 4, i.ROUND_HALF_DOWN = 5, i.ROUND_HALF_EVEN = 6, i.ROUND_HALF_CEIL = 7, i.ROUND_HALF_FLOOR = 8, i.clone = ii, i.config = i.set = ra, t === void 0 && (t = {}), t) for (n = ["precision", "rounding", "toExpNeg", "toExpPos", "LN10"], e = 0; e < n.length; ) t.hasOwnProperty(r = n[e++]) || (t[r] = this[r]);
      return i.config(t), i;
    }
    __name(ii, "ii");
    function ra(t) {
      if (!t || typeof t != "object") throw Error(le + "Object expected");
      var e, r, n, i = ["precision", 1, je, "rounding", 0, 8, "toExpNeg", -1 / 0, 0, "toExpPos", 0, 1 / 0];
      for (e = 0; e < i.length; e += 3) if ((n = t[r = i[e]]) !== void 0) if (Qe(n) === n && n >= i[e + 1] && n <= i[e + 2]) this[r] = n;
      else throw Error(_e + r + ": " + n);
      if ((n = t[r = "LN10"]) !== void 0) if (n == Math.LN10) this[r] = new this(n);
      else throw Error(_e + r + ": " + n);
      return this;
    }
    __name(ra, "ra");
    var je;
    var ea;
    var Xr;
    var $2;
    var le;
    var _e;
    var Yr;
    var Qe;
    var ke;
    var ta;
    var oe;
    var H;
    var B;
    var ei;
    var or;
    var S;
    var we;
    var Xr;
    var sr;
    var oi = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      je = 1e9, ea = { precision: 20, rounding: 4, toExpNeg: -7, toExpPos: 21, LN10: "2.302585092994045684017991454684364207601101488628772976033327900967572609677352480235997205089598298341967784042286" }, $2 = true, le = "[DecimalError] ", _e = le + "Invalid argument: ", Yr = le + "Exponent out of range: ", Qe = Math.floor, ke = Math.pow, ta = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, H = 1e7, B = 7, ei = 9007199254740991, or = Qe(ei / B), S = {};
      S.absoluteValue = S.abs = function() {
        var t = new this.constructor(this);
        return t.s && (t.s = 1), t;
      };
      S.comparedTo = S.cmp = function(t) {
        var e, r, n, i, o = this;
        if (t = new o.constructor(t), o.s !== t.s) return o.s || -t.s;
        if (o.e !== t.e) return o.e > t.e ^ o.s < 0 ? 1 : -1;
        for (n = o.d.length, i = t.d.length, e = 0, r = n < i ? n : i; e < r; ++e) if (o.d[e] !== t.d[e]) return o.d[e] > t.d[e] ^ o.s < 0 ? 1 : -1;
        return n === i ? 0 : n > i ^ o.s < 0 ? 1 : -1;
      };
      S.decimalPlaces = S.dp = function() {
        var t = this, e = t.d.length - 1, r = (e - t.e) * B;
        if (e = t.d[e], e) for (; e % 10 == 0; e /= 10) r--;
        return r < 0 ? 0 : r;
      };
      S.dividedBy = S.div = function(t) {
        return we(this, new this.constructor(t));
      };
      S.dividedToIntegerBy = S.idiv = function(t) {
        var e = this, r = e.constructor;
        return N(we(e, new r(t), 0, 1), r.precision);
      };
      S.equals = S.eq = function(t) {
        return !this.cmp(t);
      };
      S.exponent = function() {
        return W(this);
      };
      S.greaterThan = S.gt = function(t) {
        return this.cmp(t) > 0;
      };
      S.greaterThanOrEqualTo = S.gte = function(t) {
        return this.cmp(t) >= 0;
      };
      S.isInteger = S.isint = function() {
        return this.e > this.d.length - 2;
      };
      S.isNegative = S.isneg = function() {
        return this.s < 0;
      };
      S.isPositive = S.ispos = function() {
        return this.s > 0;
      };
      S.isZero = function() {
        return this.s === 0;
      };
      S.lessThan = S.lt = function(t) {
        return this.cmp(t) < 0;
      };
      S.lessThanOrEqualTo = S.lte = function(t) {
        return this.cmp(t) < 1;
      };
      S.logarithm = S.log = function(t) {
        var e, r = this, n = r.constructor, i = n.precision, o = i + 5;
        if (t === void 0) t = new n(10);
        else if (t = new n(t), t.s < 1 || t.eq(oe)) throw Error(le + "NaN");
        if (r.s < 1) throw Error(le + (r.s ? "NaN" : "-Infinity"));
        return r.eq(oe) ? new n(0) : ($2 = false, e = we(Et(r, o), Et(t, o), o), $2 = true, N(e, i));
      };
      S.minus = S.sub = function(t) {
        var e = this;
        return t = new e.constructor(t), e.s == t.s ? ni(e, t) : ti(e, (t.s = -t.s, t));
      };
      S.modulo = S.mod = function(t) {
        var e, r = this, n = r.constructor, i = n.precision;
        if (t = new n(t), !t.s) throw Error(le + "NaN");
        return r.s ? ($2 = false, e = we(r, t, 0, 1).times(t), $2 = true, r.minus(e)) : N(new n(r), i);
      };
      S.naturalExponential = S.exp = function() {
        return ri(this);
      };
      S.naturalLogarithm = S.ln = function() {
        return Et(this);
      };
      S.negated = S.neg = function() {
        var t = new this.constructor(this);
        return t.s = -t.s || 0, t;
      };
      S.plus = S.add = function(t) {
        var e = this;
        return t = new e.constructor(t), e.s == t.s ? ti(e, t) : ni(e, (t.s = -t.s, t));
      };
      S.precision = S.sd = function(t) {
        var e, r, n, i = this;
        if (t !== void 0 && t !== !!t && t !== 1 && t !== 0) throw Error(_e + t);
        if (e = W(i) + 1, n = i.d.length - 1, r = n * B + 1, n = i.d[n], n) {
          for (; n % 10 == 0; n /= 10) r--;
          for (n = i.d[0]; n >= 10; n /= 10) r++;
        }
        return t && e > r ? e : r;
      };
      S.squareRoot = S.sqrt = function() {
        var t, e, r, n, i, o, s, a = this, f = a.constructor;
        if (a.s < 1) {
          if (!a.s) return new f(0);
          throw Error(le + "NaN");
        }
        for (t = W(a), $2 = false, i = Math.sqrt(+a), i == 0 || i == 1 / 0 ? (e = me(a.d), (e.length + t) % 2 == 0 && (e += "0"), i = Math.sqrt(e), t = Qe((t + 1) / 2) - (t < 0 || t % 2), i == 1 / 0 ? e = "5e" + t : (e = i.toExponential(), e = e.slice(0, e.indexOf("e") + 1) + t), n = new f(e)) : n = new f(i.toString()), r = f.precision, i = s = r + 3; ; ) if (o = n, n = o.plus(we(a, o, s + 2)).times(0.5), me(o.d).slice(0, s) === (e = me(n.d)).slice(0, s)) {
          if (e = e.slice(s - 3, s + 1), i == s && e == "4999") {
            if (N(o, r + 1, 0), o.times(o).eq(a)) {
              n = o;
              break;
            }
          } else if (e != "9999") break;
          s += 4;
        }
        return $2 = true, N(n, r);
      };
      S.times = S.mul = function(t) {
        var e, r, n, i, o, s, a, f, v, R = this, A = R.constructor, I = R.d, C = (t = new A(t)).d;
        if (!R.s || !t.s) return new A(0);
        for (t.s *= R.s, r = R.e + t.e, f = I.length, v = C.length, f < v && (o = I, I = C, C = o, s = f, f = v, v = s), o = [], s = f + v, n = s; n--; ) o.push(0);
        for (n = v; --n >= 0; ) {
          for (e = 0, i = f + n; i > n; ) a = o[i] + C[n] * I[i - n - 1] + e, o[i--] = a % H | 0, e = a / H | 0;
          o[i] = (o[i] + e) % H | 0;
        }
        for (; !o[--s]; ) o.pop();
        return e ? ++r : o.shift(), t.d = o, t.e = r, $2 ? N(t, A.precision) : t;
      };
      S.toDecimalPlaces = S.todp = function(t, e) {
        var r = this, n = r.constructor;
        return r = new n(r), t === void 0 ? r : (de(t, 0, je), e === void 0 ? e = n.rounding : de(e, 0, 8), N(r, t + W(r) + 1, e));
      };
      S.toExponential = function(t, e) {
        var r, n = this, i = n.constructor;
        return t === void 0 ? r = Me(n, true) : (de(t, 0, je), e === void 0 ? e = i.rounding : de(e, 0, 8), n = N(new i(n), t + 1, e), r = Me(n, true, t + 1)), r;
      };
      S.toFixed = function(t, e) {
        var r, n, i = this, o = i.constructor;
        return t === void 0 ? Me(i) : (de(t, 0, je), e === void 0 ? e = o.rounding : de(e, 0, 8), n = N(new o(i), t + W(i) + 1, e), r = Me(n.abs(), false, t + W(n) + 1), i.isneg() && !i.isZero() ? "-" + r : r);
      };
      S.toInteger = S.toint = function() {
        var t = this, e = t.constructor;
        return N(new e(t), W(t) + 1, e.rounding);
      };
      S.toNumber = function() {
        return +this;
      };
      S.toPower = S.pow = function(t) {
        var e, r, n, i, o, s, a = this, f = a.constructor, v = 12, R = +(t = new f(t));
        if (!t.s) return new f(oe);
        if (a = new f(a), !a.s) {
          if (t.s < 1) throw Error(le + "Infinity");
          return a;
        }
        if (a.eq(oe)) return a;
        if (n = f.precision, t.eq(oe)) return N(a, n);
        if (e = t.e, r = t.d.length - 1, s = e >= r, o = a.s, s) {
          if ((r = R < 0 ? -R : R) <= ei) {
            for (i = new f(oe), e = Math.ceil(n / B + 4), $2 = false; r % 2 && (i = i.times(a), Zn(i.d, e)), r = Qe(r / 2), r !== 0; ) a = a.times(a), Zn(a.d, e);
            return $2 = true, t.s < 0 ? new f(oe).div(i) : N(i, n);
          }
        } else if (o < 0) throw Error(le + "NaN");
        return o = o < 0 && t.d[Math.max(e, r)] & 1 ? -1 : 1, a.s = 1, $2 = false, i = t.times(Et(a, n + v)), $2 = true, i = ri(i), i.s = o, i;
      };
      S.toPrecision = function(t, e) {
        var r, n, i = this, o = i.constructor;
        return t === void 0 ? (r = W(i), n = Me(i, r <= o.toExpNeg || r >= o.toExpPos)) : (de(t, 1, je), e === void 0 ? e = o.rounding : de(e, 0, 8), i = N(new o(i), t, e), r = W(i), n = Me(i, t <= r || r <= o.toExpNeg, t)), n;
      };
      S.toSignificantDigits = S.tosd = function(t, e) {
        var r = this, n = r.constructor;
        return t === void 0 ? (t = n.precision, e = n.rounding) : (de(t, 1, je), e === void 0 ? e = n.rounding : de(e, 0, 8)), N(new n(r), t, e);
      };
      S.toString = S.valueOf = S.val = S.toJSON = S[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = function() {
        var t = this, e = W(t), r = t.constructor;
        return Me(t, e <= r.toExpNeg || e >= r.toExpPos);
      };
      we = /* @__PURE__ */ (function() {
        function t(n, i) {
          var o, s = 0, a = n.length;
          for (n = n.slice(); a--; ) o = n[a] * i + s, n[a] = o % H | 0, s = o / H | 0;
          return s && n.unshift(s), n;
        }
        __name(t, "t");
        function e(n, i, o, s) {
          var a, f;
          if (o != s) f = o > s ? 1 : -1;
          else for (a = f = 0; a < o; a++) if (n[a] != i[a]) {
            f = n[a] > i[a] ? 1 : -1;
            break;
          }
          return f;
        }
        __name(e, "e");
        function r(n, i, o) {
          for (var s = 0; o--; ) n[o] -= s, s = n[o] < i[o] ? 1 : 0, n[o] = s * H + n[o] - i[o];
          for (; !n[0] && n.length > 1; ) n.shift();
        }
        __name(r, "r");
        return function(n, i, o, s) {
          var a, f, v, R, A, I, C, L, D, k, Ee, ee, U, te, Oe, Wr, ue, tr, rr = n.constructor, qs = n.s == i.s ? 1 : -1, pe = n.d, G = i.d;
          if (!n.s) return new rr(n);
          if (!i.s) throw Error(le + "Division by zero");
          for (f = n.e - i.e, ue = G.length, Oe = pe.length, C = new rr(qs), L = C.d = [], v = 0; G[v] == (pe[v] || 0); ) ++v;
          if (G[v] > (pe[v] || 0) && --f, o == null ? ee = o = rr.precision : s ? ee = o + (W(n) - W(i)) + 1 : ee = o, ee < 0) return new rr(0);
          if (ee = ee / B + 2 | 0, v = 0, ue == 1) for (R = 0, G = G[0], ee++; (v < Oe || R) && ee--; v++) U = R * H + (pe[v] || 0), L[v] = U / G | 0, R = U % G | 0;
          else {
            for (R = H / (G[0] + 1) | 0, R > 1 && (G = t(G, R), pe = t(pe, R), ue = G.length, Oe = pe.length), te = ue, D = pe.slice(0, ue), k = D.length; k < ue; ) D[k++] = 0;
            tr = G.slice(), tr.unshift(0), Wr = G[0], G[1] >= H / 2 && ++Wr;
            do
              R = 0, a = e(G, D, ue, k), a < 0 ? (Ee = D[0], ue != k && (Ee = Ee * H + (D[1] || 0)), R = Ee / Wr | 0, R > 1 ? (R >= H && (R = H - 1), A = t(G, R), I = A.length, k = D.length, a = e(A, D, I, k), a == 1 && (R--, r(A, ue < I ? tr : G, I))) : (R == 0 && (a = R = 1), A = G.slice()), I = A.length, I < k && A.unshift(0), r(D, A, k), a == -1 && (k = D.length, a = e(G, D, ue, k), a < 1 && (R++, r(D, ue < k ? tr : G, k))), k = D.length) : a === 0 && (R++, D = [0]), L[v++] = R, a && D[0] ? D[k++] = pe[te] || 0 : (D = [pe[te]], k = 1);
            while ((te++ < Oe || D[0] !== void 0) && ee--);
          }
          return L[0] || L.shift(), C.e = f, N(C, s ? o + W(C) + 1 : o);
        };
      })();
      Xr = ii(ea);
      oe = new Xr(1);
      sr = Xr;
    });
    var P;
    var xe;
    var l = ae(() => {
      "use strict";
      oi();
      P = class extends sr {
        static {
          __name(this, "P");
        }
        static isDecimal(e) {
          return e instanceof sr;
        }
        static random(e = 20) {
          {
            let n = globalThis.crypto.getRandomValues(new Uint8Array(e)).reduce((i, o) => i + o, "");
            return new sr(`0.${n.slice(0, e)}`);
          }
        }
      }, xe = P;
    });
    function la() {
      return false;
    }
    __name(la, "la");
    function nn() {
      return { dev: 0, ino: 0, mode: 0, nlink: 0, uid: 0, gid: 0, rdev: 0, size: 0, blksize: 0, blocks: 0, atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0, atime: /* @__PURE__ */ new Date(), mtime: /* @__PURE__ */ new Date(), ctime: /* @__PURE__ */ new Date(), birthtime: /* @__PURE__ */ new Date() };
    }
    __name(nn, "nn");
    function ua() {
      return nn();
    }
    __name(ua, "ua");
    function ca() {
      return [];
    }
    __name(ca, "ca");
    function pa(t) {
      t(null, []);
    }
    __name(pa, "pa");
    function ma() {
      return "";
    }
    __name(ma, "ma");
    function da() {
      return "";
    }
    __name(da, "da");
    function fa() {
    }
    __name(fa, "fa");
    function ga() {
    }
    __name(ga, "ga");
    function ya() {
    }
    __name(ya, "ya");
    function ha() {
    }
    __name(ha, "ha");
    function ba() {
    }
    __name(ba, "ba");
    function Ea() {
    }
    __name(Ea, "Ea");
    function wa() {
    }
    __name(wa, "wa");
    function xa() {
    }
    __name(xa, "xa");
    function Pa() {
      return { close: /* @__PURE__ */ __name(() => {
      }, "close"), on: /* @__PURE__ */ __name(() => {
      }, "on"), removeAllListeners: /* @__PURE__ */ __name(() => {
      }, "removeAllListeners") };
    }
    __name(Pa, "Pa");
    function Ta(t, e) {
      e(null, nn());
    }
    __name(Ta, "Ta");
    var va;
    var Ra;
    var Pi;
    var Ti = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      va = {}, Ra = { existsSync: la, lstatSync: nn, stat: Ta, statSync: ua, readdirSync: ca, readdir: pa, readlinkSync: ma, realpathSync: da, chmodSync: fa, renameSync: ga, mkdirSync: ya, rmdirSync: ha, rmSync: ba, unlinkSync: Ea, watchFile: wa, unwatchFile: xa, watch: Pa, promises: va }, Pi = Ra;
    });
    var vi = yt((Yp, Aa) => {
      Aa.exports = { name: "@prisma/internals", version: "6.19.3", description: "This package is intended for Prisma's internal use", main: "dist/index.js", types: "dist/index.d.ts", repository: { type: "git", url: "https://github.com/prisma/prisma.git", directory: "packages/internals" }, homepage: "https://www.prisma.io", author: "Tim Suchanek <suchanek@prisma.io>", bugs: "https://github.com/prisma/prisma/issues", license: "Apache-2.0", scripts: { dev: "DEV=true tsx helpers/build.ts", build: "tsx helpers/build.ts", test: "dotenv -e ../../.db.env -- jest --silent", prepublishOnly: "pnpm run build" }, files: ["README.md", "dist", "!**/libquery_engine*", "!dist/get-generators/engines/*", "scripts"], devDependencies: { "@babel/helper-validator-identifier": "7.25.9", "@opentelemetry/api": "1.9.0", "@swc/core": "1.11.5", "@swc/jest": "0.2.37", "@types/babel__helper-validator-identifier": "7.15.2", "@types/jest": "29.5.14", "@types/node": "18.19.76", "@types/resolve": "1.20.6", archiver: "6.0.2", "checkpoint-client": "1.1.33", "cli-truncate": "4.0.0", dotenv: "16.5.0", empathic: "2.0.0", "escape-string-regexp": "5.0.0", execa: "8.0.1", "fast-glob": "3.3.3", "find-up": "7.0.0", "fp-ts": "2.16.9", "fs-extra": "11.3.0", "global-directory": "4.0.0", globby: "11.1.0", "identifier-regex": "1.0.0", "indent-string": "4.0.0", "is-windows": "1.0.2", "is-wsl": "3.1.0", jest: "29.7.0", "jest-junit": "16.0.0", kleur: "4.1.5", "mock-stdin": "1.0.0", "new-github-issue-url": "0.2.1", "node-fetch": "3.3.2", "npm-packlist": "5.1.3", open: "7.4.2", "p-map": "4.0.0", resolve: "1.22.10", "string-width": "7.2.0", "strip-indent": "4.0.0", "temp-dir": "2.0.0", tempy: "1.0.1", "terminal-link": "4.0.0", tmp: "0.2.3", "ts-pattern": "5.6.2", "ts-toolbelt": "9.6.0", typescript: "5.4.5", yarn: "1.22.22" }, dependencies: { "@prisma/config": "workspace:*", "@prisma/debug": "workspace:*", "@prisma/dmmf": "workspace:*", "@prisma/driver-adapter-utils": "workspace:*", "@prisma/engines": "workspace:*", "@prisma/fetch-engine": "workspace:*", "@prisma/generator": "workspace:*", "@prisma/generator-helper": "workspace:*", "@prisma/get-platform": "workspace:*", "@prisma/prisma-schema-wasm": "7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7", "@prisma/schema-engine-wasm": "7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7", "@prisma/schema-files-loader": "workspace:*", arg: "5.0.2", prompts: "2.4.2" }, peerDependencies: { typescript: ">=5.1.0" }, peerDependenciesMeta: { typescript: { optional: true } }, sideEffects: false };
    });
    function Sa(...t) {
      return t.join("/");
    }
    __name(Sa, "Sa");
    function Ia(...t) {
      return t.join("/");
    }
    __name(Ia, "Ia");
    function Da(t) {
      let e = Ri(t), r = Ai(t), [n, i] = e.split(".");
      return { root: "/", dir: r, base: e, ext: i, name: n };
    }
    __name(Da, "Da");
    function Ri(t) {
      let e = t.split("/");
      return e[e.length - 1];
    }
    __name(Ri, "Ri");
    function Ai(t) {
      return t.split("/").slice(0, -1).join("/");
    }
    __name(Ai, "Ai");
    function ka(t) {
      let e = t.split("/").filter((i) => i !== "" && i !== "."), r = [];
      for (let i of e) i === ".." ? r.pop() : r.push(i);
      let n = r.join("/");
      return t.startsWith("/") ? "/" + n : n;
    }
    __name(ka, "ka");
    var Ci;
    var Oa;
    var _a;
    var Ma;
    var cr;
    var Si = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      Ci = "/", Oa = ":";
      _a = { sep: Ci }, Ma = { basename: Ri, delimiter: Oa, dirname: Ai, join: Ia, normalize: ka, parse: Da, posix: _a, resolve: Sa, sep: Ci }, cr = Ma;
    });
    var un = yt((ud, qa) => {
      qa.exports = { name: "@prisma/engines-version", version: "7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7", main: "index.js", types: "index.d.ts", license: "Apache-2.0", author: "Tim Suchanek <suchanek@prisma.io>", prisma: { enginesVersion: "c2990dca591cba766e3b7ef5d9e8a84796e47ab7" }, repository: { type: "git", url: "https://github.com/prisma/engines-wrapper.git", directory: "packages/engines-version" }, devDependencies: { "@types/node": "18.19.76", typescript: "4.9.5" }, files: ["index.js", "index.d.ts"], scripts: { build: "tsc -d" } };
    });
    var Di = yt((dr) => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      Object.defineProperty(dr, "__esModule", { value: true });
      dr.enginesVersion = void 0;
      dr.enginesVersion = un().prisma.enginesVersion;
    });
    var _i = yt((vd, ki) => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      ki.exports = (t, e = 1, r) => {
        if (r = { indent: " ", includeEmptyLines: false, ...r }, typeof t != "string") throw new TypeError(`Expected \`input\` to be a \`string\`, got \`${typeof t}\``);
        if (typeof e != "number") throw new TypeError(`Expected \`count\` to be a \`number\`, got \`${typeof e}\``);
        if (typeof r.indent != "string") throw new TypeError(`Expected \`options.indent\` to be a \`string\`, got \`${typeof r.indent}\``);
        if (e === 0) return t;
        let n = r.includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;
        return t.replace(n, r.indent.repeat(e));
      };
    });
    var hn = yt((eb, qi) => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      qi.exports = /* @__PURE__ */ (function() {
        function t(e, r, n, i, o) {
          return e < r || n < r ? e > n ? n + 1 : e + 1 : i === o ? r : r + 1;
        }
        __name(t, "t");
        return function(e, r) {
          if (e === r) return 0;
          if (e.length > r.length) {
            var n = e;
            e = r, r = n;
          }
          for (var i = e.length, o = r.length; i > 0 && e.charCodeAt(i - 1) === r.charCodeAt(o - 1); ) i--, o--;
          for (var s = 0; s < i && e.charCodeAt(s) === r.charCodeAt(s); ) s++;
          if (i -= s, o -= s, i === 0 || o < 3) return o;
          var a = 0, f, v, R, A, I, C, L, D, k, Ee, ee, U, te = [];
          for (f = 0; f < i; f++) te.push(f + 1), te.push(e.charCodeAt(s + f));
          for (var Oe = te.length - 1; a < o - 3; ) for (k = r.charCodeAt(s + (v = a)), Ee = r.charCodeAt(s + (R = a + 1)), ee = r.charCodeAt(s + (A = a + 2)), U = r.charCodeAt(s + (I = a + 3)), C = a += 4, f = 0; f < Oe; f += 2) L = te[f], D = te[f + 1], v = t(L, v, R, k, D), R = t(v, R, A, Ee, D), A = t(R, A, I, ee, D), C = t(A, I, C, U, D), te[f] = C, I = A, A = R, R = v, v = L;
          for (; a < o; ) for (k = r.charCodeAt(s + (v = a)), C = ++a, f = 0; f < Oe; f += 2) L = te[f], te[f] = C = t(L, v, C, k, te[f + 1]), v = L;
          return C;
        };
      })();
    });
    var Qi = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
    });
    var Gi = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
    });
    var Fr;
    var yo = ae(() => {
      "use strict";
      u();
      c();
      p();
      m();
      d();
      l();
      Fr = class {
        static {
          __name(this, "Fr");
        }
        events = {};
        on(e, r) {
          return this.events[e] || (this.events[e] = []), this.events[e].push(r), this;
        }
        emit(e, ...r) {
          return this.events[e] ? (this.events[e].forEach((n) => {
            n(...r);
          }), true) : false;
        }
      };
    });
    var zu = {};
    ht(zu, { DMMF: /* @__PURE__ */ __name(() => At, "DMMF"), Debug: /* @__PURE__ */ __name(() => j, "Debug"), Decimal: /* @__PURE__ */ __name(() => xe, "Decimal"), Extensions: /* @__PURE__ */ __name(() => Zr, "Extensions"), MetricsClient: /* @__PURE__ */ __name(() => nt, "MetricsClient"), PrismaClientInitializationError: /* @__PURE__ */ __name(() => M, "PrismaClientInitializationError"), PrismaClientKnownRequestError: /* @__PURE__ */ __name(() => X, "PrismaClientKnownRequestError"), PrismaClientRustPanicError: /* @__PURE__ */ __name(() => Te, "PrismaClientRustPanicError"), PrismaClientUnknownRequestError: /* @__PURE__ */ __name(() => Q, "PrismaClientUnknownRequestError"), PrismaClientValidationError: /* @__PURE__ */ __name(() => Y, "PrismaClientValidationError"), Public: /* @__PURE__ */ __name(() => en, "Public"), Sql: /* @__PURE__ */ __name(() => ne, "Sql"), createParam: /* @__PURE__ */ __name(() => ao, "createParam"), defineDmmfProperty: /* @__PURE__ */ __name(() => fo, "defineDmmfProperty"), deserializeJsonResponse: /* @__PURE__ */ __name(() => lt, "deserializeJsonResponse"), deserializeRawResult: /* @__PURE__ */ __name(() => Gr, "deserializeRawResult"), dmmfToRuntimeDataModel: /* @__PURE__ */ __name(() => Ui, "dmmfToRuntimeDataModel"), empty: /* @__PURE__ */ __name(() => bo, "empty"), getPrismaClient: /* @__PURE__ */ __name(() => Fs, "getPrismaClient"), getRuntime: /* @__PURE__ */ __name(() => ut, "getRuntime"), join: /* @__PURE__ */ __name(() => ho, "join"), makeStrictEnum: /* @__PURE__ */ __name(() => Ns, "makeStrictEnum"), makeTypedQueryFactory: /* @__PURE__ */ __name(() => go, "makeTypedQueryFactory"), objectEnumValues: /* @__PURE__ */ __name(() => Ar, "objectEnumValues"), raw: /* @__PURE__ */ __name(() => An, "raw"), serializeJsonQuery: /* @__PURE__ */ __name(() => _r, "serializeJsonQuery"), skip: /* @__PURE__ */ __name(() => kr, "skip"), sqltag: /* @__PURE__ */ __name(() => Cn, "sqltag"), warnEnvConflicts: /* @__PURE__ */ __name(() => void 0, "warnEnvConflicts"), warnOnce: /* @__PURE__ */ __name(() => Tt, "warnOnce") });
    module.exports = Gs(zu);
    u();
    c();
    p();
    m();
    d();
    l();
    var Zr = {};
    ht(Zr, { defineExtension: /* @__PURE__ */ __name(() => si, "defineExtension"), getExtensionContext: /* @__PURE__ */ __name(() => ai, "getExtensionContext") });
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function si(t) {
      return typeof t == "function" ? t : (e) => e.$extends(t);
    }
    __name(si, "si");
    u();
    c();
    p();
    m();
    d();
    l();
    function ai(t) {
      return t;
    }
    __name(ai, "ai");
    var en = {};
    ht(en, { validator: /* @__PURE__ */ __name(() => li, "validator") });
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function li(...t) {
      return (e) => e;
    }
    __name(li, "li");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var tn;
    var ui;
    var ci;
    var pi;
    var mi = true;
    typeof g < "u" && ({ FORCE_COLOR: tn, NODE_DISABLE_COLORS: ui, NO_COLOR: ci, TERM: pi } = g.env || {}, mi = g.stdout && g.stdout.isTTY);
    var na = { enabled: !ui && ci == null && pi !== "dumb" && (tn != null && tn !== "0" || mi) };
    function q(t, e) {
      let r = new RegExp(`\\x1b\\[${e}m`, "g"), n = `\x1B[${t}m`, i = `\x1B[${e}m`;
      return function(o) {
        return !na.enabled || o == null ? o : n + (~("" + o).indexOf(i) ? o.replace(r, i + n) : o) + i;
      };
    }
    __name(q, "q");
    var Kc = q(0, 0);
    var ar = q(1, 22);
    var lr = q(2, 22);
    var Hc = q(3, 23);
    var di = q(4, 24);
    var zc = q(7, 27);
    var Yc = q(8, 28);
    var Xc = q(9, 29);
    var Zc = q(30, 39);
    var Ge = q(31, 39);
    var fi = q(32, 39);
    var gi = q(33, 39);
    var yi = q(34, 39);
    var ep = q(35, 39);
    var hi = q(36, 39);
    var tp = q(37, 39);
    var bi = q(90, 39);
    var rp = q(90, 39);
    var np = q(40, 49);
    var ip = q(41, 49);
    var op = q(42, 49);
    var sp = q(43, 49);
    var ap = q(44, 49);
    var lp = q(45, 49);
    var up = q(46, 49);
    var cp = q(47, 49);
    u();
    c();
    p();
    m();
    d();
    l();
    var ia = 100;
    var Ei = ["green", "yellow", "blue", "magenta", "cyan", "red"];
    var ur = [];
    var wi = Date.now();
    var oa = 0;
    var rn = typeof g < "u" ? g.env : {};
    globalThis.DEBUG ??= rn.DEBUG ?? "";
    globalThis.DEBUG_COLORS ??= rn.DEBUG_COLORS ? rn.DEBUG_COLORS === "true" : true;
    var wt = { enable(t) {
      typeof t == "string" && (globalThis.DEBUG = t);
    }, disable() {
      let t = globalThis.DEBUG;
      return globalThis.DEBUG = "", t;
    }, enabled(t) {
      let e = globalThis.DEBUG.split(",").map((i) => i.replace(/[.+?^${}()|[\]\\]/g, "\\$&")), r = e.some((i) => i === "" || i[0] === "-" ? false : t.match(RegExp(i.split("*").join(".*") + "$"))), n = e.some((i) => i === "" || i[0] !== "-" ? false : t.match(RegExp(i.slice(1).split("*").join(".*") + "$")));
      return r && !n;
    }, log: /* @__PURE__ */ __name((...t) => {
      let [e, r, ...n] = t;
      (console.warn ?? console.log)(`${e} ${r}`, ...n);
    }, "log"), formatters: {} };
    function sa(t) {
      let e = { color: Ei[oa++ % Ei.length], enabled: wt.enabled(t), namespace: t, log: wt.log, extend: /* @__PURE__ */ __name(() => {
      }, "extend") }, r = /* @__PURE__ */ __name((...n) => {
        let { enabled: i, namespace: o, color: s, log: a } = e;
        if (n.length !== 0 && ur.push([o, ...n]), ur.length > ia && ur.shift(), wt.enabled(o) || i) {
          let f = n.map((R) => typeof R == "string" ? R : aa(R)), v = `+${Date.now() - wi}ms`;
          wi = Date.now(), a(o, ...f, v);
        }
      }, "r");
      return new Proxy(r, { get: /* @__PURE__ */ __name((n, i) => e[i], "get"), set: /* @__PURE__ */ __name((n, i, o) => e[i] = o, "set") });
    }
    __name(sa, "sa");
    var j = new Proxy(sa, { get: /* @__PURE__ */ __name((t, e) => wt[e], "get"), set: /* @__PURE__ */ __name((t, e, r) => wt[e] = r, "set") });
    function aa(t, e = 2) {
      let r = /* @__PURE__ */ new Set();
      return JSON.stringify(t, (n, i) => {
        if (typeof i == "object" && i !== null) {
          if (r.has(i)) return "[Circular *]";
          r.add(i);
        } else if (typeof i == "bigint") return i.toString();
        return i;
      }, e);
    }
    __name(aa, "aa");
    function xi() {
      ur.length = 0;
    }
    __name(xi, "xi");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var on = ["darwin", "darwin-arm64", "debian-openssl-1.0.x", "debian-openssl-1.1.x", "debian-openssl-3.0.x", "rhel-openssl-1.0.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x", "linux-arm64-openssl-1.1.x", "linux-arm64-openssl-1.0.x", "linux-arm64-openssl-3.0.x", "linux-arm-openssl-1.1.x", "linux-arm-openssl-1.0.x", "linux-arm-openssl-3.0.x", "linux-musl", "linux-musl-openssl-3.0.x", "linux-musl-arm64-openssl-1.1.x", "linux-musl-arm64-openssl-3.0.x", "linux-nixos", "linux-static-x64", "linux-static-arm64", "windows", "freebsd11", "freebsd12", "freebsd13", "freebsd14", "freebsd15", "openbsd", "netbsd", "arm"];
    u();
    c();
    p();
    m();
    d();
    l();
    var Ca = vi();
    var sn = Ca.version;
    u();
    c();
    p();
    m();
    d();
    l();
    function Je(t) {
      let e = La();
      return e || (t?.config.engineType === "library" ? "library" : t?.config.engineType === "binary" ? "binary" : t?.config.engineType === "client" ? "client" : Fa());
    }
    __name(Je, "Je");
    function La() {
      let t = g.env.PRISMA_CLIENT_ENGINE_TYPE;
      return t === "library" ? "library" : t === "binary" ? "binary" : t === "client" ? "client" : void 0;
    }
    __name(La, "La");
    function Fa() {
      return "library";
    }
    __name(Fa, "Fa");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function an(t) {
      return t.name === "DriverAdapterError" && typeof t.cause == "object";
    }
    __name(an, "an");
    u();
    c();
    p();
    m();
    d();
    l();
    function pr(t) {
      return { ok: true, value: t, map(e) {
        return pr(e(t));
      }, flatMap(e) {
        return e(t);
      } };
    }
    __name(pr, "pr");
    function Le(t) {
      return { ok: false, error: t, map() {
        return Le(t);
      }, flatMap() {
        return Le(t);
      } };
    }
    __name(Le, "Le");
    var Ii = j("driver-adapter-utils");
    var ln = class {
      static {
        __name(this, "ln");
      }
      registeredErrors = [];
      consumeError(e) {
        return this.registeredErrors[e];
      }
      registerNewError(e) {
        let r = 0;
        for (; this.registeredErrors[r] !== void 0; ) r++;
        return this.registeredErrors[r] = { error: e }, r;
      }
    };
    var mr = /* @__PURE__ */ __name((t, e = new ln()) => {
      let r = { adapterName: t.adapterName, errorRegistry: e, queryRaw: Pe(e, t.queryRaw.bind(t)), executeRaw: Pe(e, t.executeRaw.bind(t)), executeScript: Pe(e, t.executeScript.bind(t)), dispose: Pe(e, t.dispose.bind(t)), provider: t.provider, startTransaction: /* @__PURE__ */ __name(async (...n) => (await Pe(e, t.startTransaction.bind(t))(...n)).map((o) => Na(e, o)), "startTransaction") };
      return t.getConnectionInfo && (r.getConnectionInfo = Ua(e, t.getConnectionInfo.bind(t))), r;
    }, "mr");
    var Na = /* @__PURE__ */ __name((t, e) => ({ adapterName: e.adapterName, provider: e.provider, options: e.options, queryRaw: Pe(t, e.queryRaw.bind(e)), executeRaw: Pe(t, e.executeRaw.bind(e)), commit: Pe(t, e.commit.bind(e)), rollback: Pe(t, e.rollback.bind(e)) }), "Na");
    function Pe(t, e) {
      return async (...r) => {
        try {
          return pr(await e(...r));
        } catch (n) {
          if (Ii("[error@wrapAsync]", n), an(n)) return Le(n.cause);
          let i = t.registerNewError(n);
          return Le({ kind: "GenericJs", id: i });
        }
      };
    }
    __name(Pe, "Pe");
    function Ua(t, e) {
      return (...r) => {
        try {
          return pr(e(...r));
        } catch (n) {
          if (Ii("[error@wrapSync]", n), an(n)) return Le(n.cause);
          let i = t.registerNewError(n);
          return Le({ kind: "GenericJs", id: i });
        }
      };
    }
    __name(Ua, "Ua");
    u();
    c();
    p();
    m();
    d();
    l();
    var Oi = "prisma+postgres";
    var fr = `${Oi}:`;
    function gr(t) {
      return t?.toString().startsWith(`${fr}//`) ?? false;
    }
    __name(gr, "gr");
    function cn(t) {
      if (!gr(t)) return false;
      let { host: e } = new URL(t);
      return e.includes("localhost") || e.includes("127.0.0.1") || e.includes("[::1]");
    }
    __name(cn, "cn");
    var Pt = {};
    ht(Pt, { error: /* @__PURE__ */ __name(() => $a, "error"), info: /* @__PURE__ */ __name(() => Ba, "info"), log: /* @__PURE__ */ __name(() => Va, "log"), query: /* @__PURE__ */ __name(() => ja, "query"), should: /* @__PURE__ */ __name(() => Mi, "should"), tags: /* @__PURE__ */ __name(() => xt, "tags"), warn: /* @__PURE__ */ __name(() => pn, "warn") });
    u();
    c();
    p();
    m();
    d();
    l();
    var xt = { error: Ge("prisma:error"), warn: gi("prisma:warn"), info: hi("prisma:info"), query: yi("prisma:query") };
    var Mi = { warn: /* @__PURE__ */ __name(() => !g.env.PRISMA_DISABLE_WARNINGS, "warn") };
    function Va(...t) {
      console.log(...t);
    }
    __name(Va, "Va");
    function pn(t, ...e) {
      Mi.warn() && console.warn(`${xt.warn} ${t}`, ...e);
    }
    __name(pn, "pn");
    function Ba(t, ...e) {
      console.info(`${xt.info} ${t}`, ...e);
    }
    __name(Ba, "Ba");
    function $a(t, ...e) {
      console.error(`${xt.error} ${t}`, ...e);
    }
    __name($a, "$a");
    function ja(t, ...e) {
      console.log(`${xt.query} ${t}`, ...e);
    }
    __name(ja, "ja");
    u();
    c();
    p();
    m();
    d();
    l();
    function yr(t, e) {
      if (!t) throw new Error(`${e}. This should never happen. If you see this error, please, open an issue at https://pris.ly/prisma-prisma-bug-report`);
    }
    __name(yr, "yr");
    u();
    c();
    p();
    m();
    d();
    l();
    function Fe(t, e) {
      throw new Error(e);
    }
    __name(Fe, "Fe");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function mn({ onlyFirst: t = false } = {}) {
      let r = ["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?(?:\\u0007|\\u001B\\u005C|\\u009C))", "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))"].join("|");
      return new RegExp(r, t ? void 0 : "g");
    }
    __name(mn, "mn");
    var Qa = mn();
    function dn(t) {
      if (typeof t != "string") throw new TypeError(`Expected a \`string\`, got \`${typeof t}\``);
      return t.replace(Qa, "");
    }
    __name(dn, "dn");
    u();
    c();
    p();
    m();
    d();
    l();
    function fn(t, e) {
      return Object.prototype.hasOwnProperty.call(t, e);
    }
    __name(fn, "fn");
    u();
    c();
    p();
    m();
    d();
    l();
    function hr(t, e) {
      let r = {};
      for (let n of Object.keys(t)) r[n] = e(t[n], n);
      return r;
    }
    __name(hr, "hr");
    u();
    c();
    p();
    m();
    d();
    l();
    function gn(t, e) {
      if (t.length === 0) return;
      let r = t[0];
      for (let n = 1; n < t.length; n++) e(r, t[n]) < 0 && (r = t[n]);
      return r;
    }
    __name(gn, "gn");
    u();
    c();
    p();
    m();
    d();
    l();
    function O(t, e) {
      Object.defineProperty(t, "name", { value: e, configurable: true });
    }
    __name(O, "O");
    u();
    c();
    p();
    m();
    d();
    l();
    var Li = /* @__PURE__ */ new Set();
    var Tt = /* @__PURE__ */ __name((t, e, ...r) => {
      Li.has(t) || (Li.add(t), pn(e, ...r));
    }, "Tt");
    var M = class t extends Error {
      static {
        __name(this, "t");
      }
      clientVersion;
      errorCode;
      retryable;
      constructor(e, r, n) {
        super(e), this.name = "PrismaClientInitializationError", this.clientVersion = r, this.errorCode = n, Error.captureStackTrace(t);
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientInitializationError";
      }
    };
    O(M, "PrismaClientInitializationError");
    u();
    c();
    p();
    m();
    d();
    l();
    var X = class extends Error {
      static {
        __name(this, "X");
      }
      code;
      meta;
      clientVersion;
      batchRequestIdx;
      constructor(e, { code: r, clientVersion: n, meta: i, batchRequestIdx: o }) {
        super(e), this.name = "PrismaClientKnownRequestError", this.code = r, this.clientVersion = n, this.meta = i, Object.defineProperty(this, "batchRequestIdx", { value: o, enumerable: false, writable: true });
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientKnownRequestError";
      }
    };
    O(X, "PrismaClientKnownRequestError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Te = class extends Error {
      static {
        __name(this, "Te");
      }
      clientVersion;
      constructor(e, r) {
        super(e), this.name = "PrismaClientRustPanicError", this.clientVersion = r;
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientRustPanicError";
      }
    };
    O(Te, "PrismaClientRustPanicError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Q = class extends Error {
      static {
        __name(this, "Q");
      }
      clientVersion;
      batchRequestIdx;
      constructor(e, { clientVersion: r, batchRequestIdx: n }) {
        super(e), this.name = "PrismaClientUnknownRequestError", this.clientVersion = r, Object.defineProperty(this, "batchRequestIdx", { value: n, writable: true, enumerable: false });
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientUnknownRequestError";
      }
    };
    O(Q, "PrismaClientUnknownRequestError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Y = class extends Error {
      static {
        __name(this, "Y");
      }
      name = "PrismaClientValidationError";
      clientVersion;
      constructor(e, { clientVersion: r }) {
        super(e), this.clientVersion = r;
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientValidationError";
      }
    };
    O(Y, "PrismaClientValidationError");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var fe = class {
      static {
        __name(this, "fe");
      }
      _map = /* @__PURE__ */ new Map();
      get(e) {
        return this._map.get(e)?.value;
      }
      set(e, r) {
        this._map.set(e, { value: r });
      }
      getOrCreate(e, r) {
        let n = this._map.get(e);
        if (n) return n.value;
        let i = r();
        return this.set(e, i), i;
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function Ce(t) {
      return t.substring(0, 1).toLowerCase() + t.substring(1);
    }
    __name(Ce, "Ce");
    u();
    c();
    p();
    m();
    d();
    l();
    function Ni(t, e) {
      let r = {};
      for (let n of t) {
        let i = n[e];
        r[i] = n;
      }
      return r;
    }
    __name(Ni, "Ni");
    u();
    c();
    p();
    m();
    d();
    l();
    function vt(t) {
      let e;
      return { get() {
        return e || (e = { value: t() }), e.value;
      } };
    }
    __name(vt, "vt");
    u();
    c();
    p();
    m();
    d();
    l();
    function Ui(t) {
      return { models: yn(t.models), enums: yn(t.enums), types: yn(t.types) };
    }
    __name(Ui, "Ui");
    function yn(t) {
      let e = {};
      for (let { name: r, ...n } of t) e[r] = n;
      return e;
    }
    __name(yn, "yn");
    u();
    c();
    p();
    m();
    d();
    l();
    function We(t) {
      return t instanceof Date || Object.prototype.toString.call(t) === "[object Date]";
    }
    __name(We, "We");
    function br(t) {
      return t.toString() !== "Invalid Date";
    }
    __name(br, "br");
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    function Ke(t) {
      return P.isDecimal(t) ? true : t !== null && typeof t == "object" && typeof t.s == "number" && typeof t.e == "number" && typeof t.toFixed == "function" && Array.isArray(t.d);
    }
    __name(Ke, "Ke");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var At = {};
    ht(At, { ModelAction: /* @__PURE__ */ __name(() => Rt, "ModelAction"), datamodelEnumToSchemaEnum: /* @__PURE__ */ __name(() => Ga, "datamodelEnumToSchemaEnum") });
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function Ga(t) {
      return { name: t.name, values: t.values.map((e) => e.name) };
    }
    __name(Ga, "Ga");
    u();
    c();
    p();
    m();
    d();
    l();
    var Rt = ((U) => (U.findUnique = "findUnique", U.findUniqueOrThrow = "findUniqueOrThrow", U.findFirst = "findFirst", U.findFirstOrThrow = "findFirstOrThrow", U.findMany = "findMany", U.create = "create", U.createMany = "createMany", U.createManyAndReturn = "createManyAndReturn", U.update = "update", U.updateMany = "updateMany", U.updateManyAndReturn = "updateManyAndReturn", U.upsert = "upsert", U.delete = "delete", U.deleteMany = "deleteMany", U.groupBy = "groupBy", U.count = "count", U.aggregate = "aggregate", U.findRaw = "findRaw", U.aggregateRaw = "aggregateRaw", U))(Rt || {});
    var Ja = bt(_i());
    var Wa = { red: Ge, gray: bi, dim: lr, bold: ar, underline: di, highlightSource: /* @__PURE__ */ __name((t) => t.highlight(), "highlightSource") };
    var Ka = { red: /* @__PURE__ */ __name((t) => t, "red"), gray: /* @__PURE__ */ __name((t) => t, "gray"), dim: /* @__PURE__ */ __name((t) => t, "dim"), bold: /* @__PURE__ */ __name((t) => t, "bold"), underline: /* @__PURE__ */ __name((t) => t, "underline"), highlightSource: /* @__PURE__ */ __name((t) => t, "highlightSource") };
    function Ha({ message: t, originalMethod: e, isPanic: r, callArguments: n }) {
      return { functionName: `prisma.${e}()`, message: t, isPanic: r ?? false, callArguments: n };
    }
    __name(Ha, "Ha");
    function za({ functionName: t, location: e, message: r, isPanic: n, contextLines: i, callArguments: o }, s) {
      let a = [""], f = e ? " in" : ":";
      if (n ? (a.push(s.red(`Oops, an unknown error occurred! This is ${s.bold("on us")}, you did nothing wrong.`)), a.push(s.red(`It occurred in the ${s.bold(`\`${t}\``)} invocation${f}`))) : a.push(s.red(`Invalid ${s.bold(`\`${t}\``)} invocation${f}`)), e && a.push(s.underline(Ya(e))), i) {
        a.push("");
        let v = [i.toString()];
        o && (v.push(o), v.push(s.dim(")"))), a.push(v.join("")), o && a.push("");
      } else a.push(""), o && a.push(o), a.push("");
      return a.push(r), a.join(`
`);
    }
    __name(za, "za");
    function Ya(t) {
      let e = [t.fileName];
      return t.lineNumber && e.push(String(t.lineNumber)), t.columnNumber && e.push(String(t.columnNumber)), e.join(":");
    }
    __name(Ya, "Ya");
    function Er(t) {
      let e = t.showColors ? Wa : Ka, r;
      return typeof $getTemplateParameters < "u" ? r = $getTemplateParameters(t, e) : r = Ha(t), za(r, e);
    }
    __name(Er, "Er");
    u();
    c();
    p();
    m();
    d();
    l();
    var Wi = bt(hn());
    u();
    c();
    p();
    m();
    d();
    l();
    function $i(t, e, r) {
      let n = ji(t), i = Xa(n), o = el(i);
      o ? wr(o, e, r) : e.addErrorMessage(() => "Unknown error");
    }
    __name($i, "$i");
    function ji(t) {
      return t.errors.flatMap((e) => e.kind === "Union" ? ji(e) : [e]);
    }
    __name(ji, "ji");
    function Xa(t) {
      let e = /* @__PURE__ */ new Map(), r = [];
      for (let n of t) {
        if (n.kind !== "InvalidArgumentType") {
          r.push(n);
          continue;
        }
        let i = `${n.selectionPath.join(".")}:${n.argumentPath.join(".")}`, o = e.get(i);
        o ? e.set(i, { ...n, argument: { ...n.argument, typeNames: Za(o.argument.typeNames, n.argument.typeNames) } }) : e.set(i, n);
      }
      return r.push(...e.values()), r;
    }
    __name(Xa, "Xa");
    function Za(t, e) {
      return [...new Set(t.concat(e))];
    }
    __name(Za, "Za");
    function el(t) {
      return gn(t, (e, r) => {
        let n = Vi(e), i = Vi(r);
        return n !== i ? n - i : Bi(e) - Bi(r);
      });
    }
    __name(el, "el");
    function Vi(t) {
      let e = 0;
      return Array.isArray(t.selectionPath) && (e += t.selectionPath.length), Array.isArray(t.argumentPath) && (e += t.argumentPath.length), e;
    }
    __name(Vi, "Vi");
    function Bi(t) {
      switch (t.kind) {
        case "InvalidArgumentValue":
        case "ValueTooLarge":
          return 20;
        case "InvalidArgumentType":
          return 10;
        case "RequiredArgumentMissing":
          return -10;
        default:
          return 0;
      }
    }
    __name(Bi, "Bi");
    u();
    c();
    p();
    m();
    d();
    l();
    var se = class {
      static {
        __name(this, "se");
      }
      constructor(e, r) {
        this.name = e;
        this.value = r;
      }
      isRequired = false;
      makeRequired() {
        return this.isRequired = true, this;
      }
      write(e) {
        let { colors: { green: r } } = e.context;
        e.addMarginSymbol(r(this.isRequired ? "+" : "?")), e.write(r(this.name)), this.isRequired || e.write(r("?")), e.write(r(": ")), typeof this.value == "string" ? e.write(r(this.value)) : e.write(this.value);
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    Gi();
    u();
    c();
    p();
    m();
    d();
    l();
    var He = class {
      static {
        __name(this, "He");
      }
      constructor(e = 0, r) {
        this.context = r;
        this.currentIndent = e;
      }
      lines = [];
      currentLine = "";
      currentIndent = 0;
      marginSymbol;
      afterNextNewLineCallback;
      write(e) {
        return typeof e == "string" ? this.currentLine += e : e.write(this), this;
      }
      writeJoined(e, r, n = (i, o) => o.write(i)) {
        let i = r.length - 1;
        for (let o = 0; o < r.length; o++) n(r[o], this), o !== i && this.write(e);
        return this;
      }
      writeLine(e) {
        return this.write(e).newLine();
      }
      newLine() {
        this.lines.push(this.indentedCurrentLine()), this.currentLine = "", this.marginSymbol = void 0;
        let e = this.afterNextNewLineCallback;
        return this.afterNextNewLineCallback = void 0, e?.(), this;
      }
      withIndent(e) {
        return this.indent(), e(this), this.unindent(), this;
      }
      afterNextNewline(e) {
        return this.afterNextNewLineCallback = e, this;
      }
      indent() {
        return this.currentIndent++, this;
      }
      unindent() {
        return this.currentIndent > 0 && this.currentIndent--, this;
      }
      addMarginSymbol(e) {
        return this.marginSymbol = e, this;
      }
      toString() {
        return this.lines.concat(this.indentedCurrentLine()).join(`
`);
      }
      getCurrentLineLength() {
        return this.currentLine.length;
      }
      indentedCurrentLine() {
        let e = this.currentLine.padStart(this.currentLine.length + 2 * this.currentIndent);
        return this.marginSymbol ? this.marginSymbol + e.slice(1) : e;
      }
    };
    Qi();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var xr = class {
      static {
        __name(this, "xr");
      }
      constructor(e) {
        this.value = e;
      }
      write(e) {
        e.write(this.value);
      }
      markAsError() {
        this.value.markAsError();
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    var Pr = /* @__PURE__ */ __name((t) => t, "Pr");
    var Tr = { bold: Pr, red: Pr, green: Pr, dim: Pr, enabled: false };
    var Ji = { bold: ar, red: Ge, green: fi, dim: lr, enabled: true };
    var ze = { write(t) {
      t.writeLine(",");
    } };
    u();
    c();
    p();
    m();
    d();
    l();
    var ge = class {
      static {
        __name(this, "ge");
      }
      constructor(e) {
        this.contents = e;
      }
      isUnderlined = false;
      color = /* @__PURE__ */ __name((e) => e, "color");
      underline() {
        return this.isUnderlined = true, this;
      }
      setColor(e) {
        return this.color = e, this;
      }
      write(e) {
        let r = e.getCurrentLineLength();
        e.write(this.color(this.contents)), this.isUnderlined && e.afterNextNewline(() => {
          e.write(" ".repeat(r)).writeLine(this.color("~".repeat(this.contents.length)));
        });
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    var Se = class {
      static {
        __name(this, "Se");
      }
      hasError = false;
      markAsError() {
        return this.hasError = true, this;
      }
    };
    var Ye = class extends Se {
      static {
        __name(this, "Ye");
      }
      items = [];
      addItem(e) {
        return this.items.push(new xr(e)), this;
      }
      getField(e) {
        return this.items[e];
      }
      getPrintWidth() {
        return this.items.length === 0 ? 2 : Math.max(...this.items.map((r) => r.value.getPrintWidth())) + 2;
      }
      write(e) {
        if (this.items.length === 0) {
          this.writeEmpty(e);
          return;
        }
        this.writeWithItems(e);
      }
      writeEmpty(e) {
        let r = new ge("[]");
        this.hasError && r.setColor(e.context.colors.red).underline(), e.write(r);
      }
      writeWithItems(e) {
        let { colors: r } = e.context;
        e.writeLine("[").withIndent(() => e.writeJoined(ze, this.items).newLine()).write("]"), this.hasError && e.afterNextNewline(() => {
          e.writeLine(r.red("~".repeat(this.getPrintWidth())));
        });
      }
      asObject() {
      }
    };
    var Xe = class t extends Se {
      static {
        __name(this, "t");
      }
      fields = {};
      suggestions = [];
      addField(e) {
        this.fields[e.name] = e;
      }
      addSuggestion(e) {
        this.suggestions.push(e);
      }
      getField(e) {
        return this.fields[e];
      }
      getDeepField(e) {
        let [r, ...n] = e, i = this.getField(r);
        if (!i) return;
        let o = i;
        for (let s of n) {
          let a;
          if (o.value instanceof t ? a = o.value.getField(s) : o.value instanceof Ye && (a = o.value.getField(Number(s))), !a) return;
          o = a;
        }
        return o;
      }
      getDeepFieldValue(e) {
        return e.length === 0 ? this : this.getDeepField(e)?.value;
      }
      hasField(e) {
        return !!this.getField(e);
      }
      removeAllFields() {
        this.fields = {};
      }
      removeField(e) {
        delete this.fields[e];
      }
      getFields() {
        return this.fields;
      }
      isEmpty() {
        return Object.keys(this.fields).length === 0;
      }
      getFieldValue(e) {
        return this.getField(e)?.value;
      }
      getDeepSubSelectionValue(e) {
        let r = this;
        for (let n of e) {
          if (!(r instanceof t)) return;
          let i = r.getSubSelectionValue(n);
          if (!i) return;
          r = i;
        }
        return r;
      }
      getDeepSelectionParent(e) {
        let r = this.getSelectionParent();
        if (!r) return;
        let n = r;
        for (let i of e) {
          let o = n.value.getFieldValue(i);
          if (!o || !(o instanceof t)) return;
          let s = o.getSelectionParent();
          if (!s) return;
          n = s;
        }
        return n;
      }
      getSelectionParent() {
        let e = this.getField("select")?.value.asObject();
        if (e) return { kind: "select", value: e };
        let r = this.getField("include")?.value.asObject();
        if (r) return { kind: "include", value: r };
      }
      getSubSelectionValue(e) {
        return this.getSelectionParent()?.value.fields[e].value;
      }
      getPrintWidth() {
        let e = Object.values(this.fields);
        return e.length == 0 ? 2 : Math.max(...e.map((n) => n.getPrintWidth())) + 2;
      }
      write(e) {
        let r = Object.values(this.fields);
        if (r.length === 0 && this.suggestions.length === 0) {
          this.writeEmpty(e);
          return;
        }
        this.writeWithContents(e, r);
      }
      asObject() {
        return this;
      }
      writeEmpty(e) {
        let r = new ge("{}");
        this.hasError && r.setColor(e.context.colors.red).underline(), e.write(r);
      }
      writeWithContents(e, r) {
        e.writeLine("{").withIndent(() => {
          e.writeJoined(ze, [...r, ...this.suggestions]).newLine();
        }), e.write("}"), this.hasError && e.afterNextNewline(() => {
          e.writeLine(e.context.colors.red("~".repeat(this.getPrintWidth())));
        });
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    var z = class extends Se {
      static {
        __name(this, "z");
      }
      constructor(r) {
        super();
        this.text = r;
      }
      getPrintWidth() {
        return this.text.length;
      }
      write(r) {
        let n = new ge(this.text);
        this.hasError && n.underline().setColor(r.context.colors.red), r.write(n);
      }
      asObject() {
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    var Ct = class {
      static {
        __name(this, "Ct");
      }
      fields = [];
      addField(e, r) {
        return this.fields.push({ write(n) {
          let { green: i, dim: o } = n.context.colors;
          n.write(i(o(`${e}: ${r}`))).addMarginSymbol(i(o("+")));
        } }), this;
      }
      write(e) {
        let { colors: { green: r } } = e.context;
        e.writeLine(r("{")).withIndent(() => {
          e.writeJoined(ze, this.fields).newLine();
        }).write(r("}")).addMarginSymbol(r("+"));
      }
    };
    function wr(t, e, r) {
      switch (t.kind) {
        case "MutuallyExclusiveFields":
          tl(t, e);
          break;
        case "IncludeOnScalar":
          rl(t, e);
          break;
        case "EmptySelection":
          nl(t, e, r);
          break;
        case "UnknownSelectionField":
          al(t, e);
          break;
        case "InvalidSelectionValue":
          ll(t, e);
          break;
        case "UnknownArgument":
          ul(t, e);
          break;
        case "UnknownInputField":
          cl(t, e);
          break;
        case "RequiredArgumentMissing":
          pl(t, e);
          break;
        case "InvalidArgumentType":
          ml(t, e);
          break;
        case "InvalidArgumentValue":
          dl(t, e);
          break;
        case "ValueTooLarge":
          fl(t, e);
          break;
        case "SomeFieldsMissing":
          gl(t, e);
          break;
        case "TooManyFieldsGiven":
          yl(t, e);
          break;
        case "Union":
          $i(t, e, r);
          break;
        default:
          throw new Error("not implemented: " + t.kind);
      }
    }
    __name(wr, "wr");
    function tl(t, e) {
      let r = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      r && (r.getField(t.firstField)?.markAsError(), r.getField(t.secondField)?.markAsError()), e.addErrorMessage((n) => `Please ${n.bold("either")} use ${n.green(`\`${t.firstField}\``)} or ${n.green(`\`${t.secondField}\``)}, but ${n.red("not both")} at the same time.`);
    }
    __name(tl, "tl");
    function rl(t, e) {
      let [r, n] = Ze(t.selectionPath), i = t.outputType, o = e.arguments.getDeepSelectionParent(r)?.value;
      if (o && (o.getField(n)?.markAsError(), i)) for (let s of i.fields) s.isRelation && o.addSuggestion(new se(s.name, "true"));
      e.addErrorMessage((s) => {
        let a = `Invalid scalar field ${s.red(`\`${n}\``)} for ${s.bold("include")} statement`;
        return i ? a += ` on model ${s.bold(i.name)}. ${St(s)}` : a += ".", a += `
Note that ${s.bold("include")} statements only accept relation fields.`, a;
      });
    }
    __name(rl, "rl");
    function nl(t, e, r) {
      let n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      if (n) {
        let i = n.getField("omit")?.value.asObject();
        if (i) {
          il(t, e, i);
          return;
        }
        if (n.hasField("select")) {
          ol(t, e);
          return;
        }
      }
      if (r?.[Ce(t.outputType.name)]) {
        sl(t, e);
        return;
      }
      e.addErrorMessage(() => `Unknown field at "${t.selectionPath.join(".")} selection"`);
    }
    __name(nl, "nl");
    function il(t, e, r) {
      r.removeAllFields();
      for (let n of t.outputType.fields) r.addSuggestion(new se(n.name, "false"));
      e.addErrorMessage((n) => `The ${n.red("omit")} statement includes every field of the model ${n.bold(t.outputType.name)}. At least one field must be included in the result`);
    }
    __name(il, "il");
    function ol(t, e) {
      let r = t.outputType, n = e.arguments.getDeepSelectionParent(t.selectionPath)?.value, i = n?.isEmpty() ?? false;
      n && (n.removeAllFields(), zi(n, r)), e.addErrorMessage((o) => i ? `The ${o.red("`select`")} statement for type ${o.bold(r.name)} must not be empty. ${St(o)}` : `The ${o.red("`select`")} statement for type ${o.bold(r.name)} needs ${o.bold("at least one truthy value")}.`);
    }
    __name(ol, "ol");
    function sl(t, e) {
      let r = new Ct();
      for (let i of t.outputType.fields) i.isRelation || r.addField(i.name, "false");
      let n = new se("omit", r).makeRequired();
      if (t.selectionPath.length === 0) e.arguments.addSuggestion(n);
      else {
        let [i, o] = Ze(t.selectionPath), a = e.arguments.getDeepSelectionParent(i)?.value.asObject()?.getField(o);
        if (a) {
          let f = a?.value.asObject() ?? new Xe();
          f.addSuggestion(n), a.value = f;
        }
      }
      e.addErrorMessage((i) => `The global ${i.red("omit")} configuration excludes every field of the model ${i.bold(t.outputType.name)}. At least one field must be included in the result`);
    }
    __name(sl, "sl");
    function al(t, e) {
      let r = Yi(t.selectionPath, e);
      if (r.parentKind !== "unknown") {
        r.field.markAsError();
        let n = r.parent;
        switch (r.parentKind) {
          case "select":
            zi(n, t.outputType);
            break;
          case "include":
            hl(n, t.outputType);
            break;
          case "omit":
            bl(n, t.outputType);
            break;
        }
      }
      e.addErrorMessage((n) => {
        let i = [`Unknown field ${n.red(`\`${r.fieldName}\``)}`];
        return r.parentKind !== "unknown" && i.push(`for ${n.bold(r.parentKind)} statement`), i.push(`on model ${n.bold(`\`${t.outputType.name}\``)}.`), i.push(St(n)), i.join(" ");
      });
    }
    __name(al, "al");
    function ll(t, e) {
      let r = Yi(t.selectionPath, e);
      r.parentKind !== "unknown" && r.field.value.markAsError(), e.addErrorMessage((n) => `Invalid value for selection field \`${n.red(r.fieldName)}\`: ${t.underlyingError}`);
    }
    __name(ll, "ll");
    function ul(t, e) {
      let r = t.argumentPath[0], n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      n && (n.getField(r)?.markAsError(), El(n, t.arguments)), e.addErrorMessage((i) => Ki(i, r, t.arguments.map((o) => o.name)));
    }
    __name(ul, "ul");
    function cl(t, e) {
      let [r, n] = Ze(t.argumentPath), i = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      if (i) {
        i.getDeepField(t.argumentPath)?.markAsError();
        let o = i.getDeepFieldValue(r)?.asObject();
        o && Xi(o, t.inputType);
      }
      e.addErrorMessage((o) => Ki(o, n, t.inputType.fields.map((s) => s.name)));
    }
    __name(cl, "cl");
    function Ki(t, e, r) {
      let n = [`Unknown argument \`${t.red(e)}\`.`], i = xl(e, r);
      return i && n.push(`Did you mean \`${t.green(i)}\`?`), r.length > 0 && n.push(St(t)), n.join(" ");
    }
    __name(Ki, "Ki");
    function pl(t, e) {
      let r;
      e.addErrorMessage((f) => r?.value instanceof z && r.value.text === "null" ? `Argument \`${f.green(o)}\` must not be ${f.red("null")}.` : `Argument \`${f.green(o)}\` is missing.`);
      let n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      if (!n) return;
      let [i, o] = Ze(t.argumentPath), s = new Ct(), a = n.getDeepFieldValue(i)?.asObject();
      if (a) {
        if (r = a.getField(o), r && a.removeField(o), t.inputTypes.length === 1 && t.inputTypes[0].kind === "object") {
          for (let f of t.inputTypes[0].fields) s.addField(f.name, f.typeNames.join(" | "));
          a.addSuggestion(new se(o, s).makeRequired());
        } else {
          let f = t.inputTypes.map(Hi).join(" | ");
          a.addSuggestion(new se(o, f).makeRequired());
        }
        if (t.dependentArgumentPath) {
          n.getDeepField(t.dependentArgumentPath)?.markAsError();
          let [, f] = Ze(t.dependentArgumentPath);
          e.addErrorMessage((v) => `Argument \`${v.green(o)}\` is required because argument \`${v.green(f)}\` was provided.`);
        }
      }
    }
    __name(pl, "pl");
    function Hi(t) {
      return t.kind === "list" ? `${Hi(t.elementType)}[]` : t.name;
    }
    __name(Hi, "Hi");
    function ml(t, e) {
      let r = t.argument.name, n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      n && n.getDeepFieldValue(t.argumentPath)?.markAsError(), e.addErrorMessage((i) => {
        let o = vr("or", t.argument.typeNames.map((s) => i.green(s)));
        return `Argument \`${i.bold(r)}\`: Invalid value provided. Expected ${o}, provided ${i.red(t.inferredType)}.`;
      });
    }
    __name(ml, "ml");
    function dl(t, e) {
      let r = t.argument.name, n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      n && n.getDeepFieldValue(t.argumentPath)?.markAsError(), e.addErrorMessage((i) => {
        let o = [`Invalid value for argument \`${i.bold(r)}\``];
        if (t.underlyingError && o.push(`: ${t.underlyingError}`), o.push("."), t.argument.typeNames.length > 0) {
          let s = vr("or", t.argument.typeNames.map((a) => i.green(a)));
          o.push(` Expected ${s}.`);
        }
        return o.join("");
      });
    }
    __name(dl, "dl");
    function fl(t, e) {
      let r = t.argument.name, n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject(), i;
      if (n) {
        let s = n.getDeepField(t.argumentPath)?.value;
        s?.markAsError(), s instanceof z && (i = s.text);
      }
      e.addErrorMessage((o) => {
        let s = ["Unable to fit value"];
        return i && s.push(o.red(i)), s.push(`into a 64-bit signed integer for field \`${o.bold(r)}\``), s.join(" ");
      });
    }
    __name(fl, "fl");
    function gl(t, e) {
      let r = t.argumentPath[t.argumentPath.length - 1], n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject();
      if (n) {
        let i = n.getDeepFieldValue(t.argumentPath)?.asObject();
        i && Xi(i, t.inputType);
      }
      e.addErrorMessage((i) => {
        let o = [`Argument \`${i.bold(r)}\` of type ${i.bold(t.inputType.name)} needs`];
        return t.constraints.minFieldCount === 1 ? t.constraints.requiredFields ? o.push(`${i.green("at least one of")} ${vr("or", t.constraints.requiredFields.map((s) => `\`${i.bold(s)}\``))} arguments.`) : o.push(`${i.green("at least one")} argument.`) : o.push(`${i.green(`at least ${t.constraints.minFieldCount}`)} arguments.`), o.push(St(i)), o.join(" ");
      });
    }
    __name(gl, "gl");
    function yl(t, e) {
      let r = t.argumentPath[t.argumentPath.length - 1], n = e.arguments.getDeepSubSelectionValue(t.selectionPath)?.asObject(), i = [];
      if (n) {
        let o = n.getDeepFieldValue(t.argumentPath)?.asObject();
        o && (o.markAsError(), i = Object.keys(o.getFields()));
      }
      e.addErrorMessage((o) => {
        let s = [`Argument \`${o.bold(r)}\` of type ${o.bold(t.inputType.name)} needs`];
        return t.constraints.minFieldCount === 1 && t.constraints.maxFieldCount == 1 ? s.push(`${o.green("exactly one")} argument,`) : t.constraints.maxFieldCount == 1 ? s.push(`${o.green("at most one")} argument,`) : s.push(`${o.green(`at most ${t.constraints.maxFieldCount}`)} arguments,`), s.push(`but you provided ${vr("and", i.map((a) => o.red(a)))}. Please choose`), t.constraints.maxFieldCount === 1 ? s.push("one.") : s.push(`${t.constraints.maxFieldCount}.`), s.join(" ");
      });
    }
    __name(yl, "yl");
    function zi(t, e) {
      for (let r of e.fields) t.hasField(r.name) || t.addSuggestion(new se(r.name, "true"));
    }
    __name(zi, "zi");
    function hl(t, e) {
      for (let r of e.fields) r.isRelation && !t.hasField(r.name) && t.addSuggestion(new se(r.name, "true"));
    }
    __name(hl, "hl");
    function bl(t, e) {
      for (let r of e.fields) !t.hasField(r.name) && !r.isRelation && t.addSuggestion(new se(r.name, "true"));
    }
    __name(bl, "bl");
    function El(t, e) {
      for (let r of e) t.hasField(r.name) || t.addSuggestion(new se(r.name, r.typeNames.join(" | ")));
    }
    __name(El, "El");
    function Yi(t, e) {
      let [r, n] = Ze(t), i = e.arguments.getDeepSubSelectionValue(r)?.asObject();
      if (!i) return { parentKind: "unknown", fieldName: n };
      let o = i.getFieldValue("select")?.asObject(), s = i.getFieldValue("include")?.asObject(), a = i.getFieldValue("omit")?.asObject(), f = o?.getField(n);
      return o && f ? { parentKind: "select", parent: o, field: f, fieldName: n } : (f = s?.getField(n), s && f ? { parentKind: "include", field: f, parent: s, fieldName: n } : (f = a?.getField(n), a && f ? { parentKind: "omit", field: f, parent: a, fieldName: n } : { parentKind: "unknown", fieldName: n }));
    }
    __name(Yi, "Yi");
    function Xi(t, e) {
      if (e.kind === "object") for (let r of e.fields) t.hasField(r.name) || t.addSuggestion(new se(r.name, r.typeNames.join(" | ")));
    }
    __name(Xi, "Xi");
    function Ze(t) {
      let e = [...t], r = e.pop();
      if (!r) throw new Error("unexpected empty path");
      return [e, r];
    }
    __name(Ze, "Ze");
    function St({ green: t, enabled: e }) {
      return "Available options are " + (e ? `listed in ${t("green")}` : "marked with ?") + ".";
    }
    __name(St, "St");
    function vr(t, e) {
      if (e.length === 1) return e[0];
      let r = [...e], n = r.pop();
      return `${r.join(", ")} ${t} ${n}`;
    }
    __name(vr, "vr");
    var wl = 3;
    function xl(t, e) {
      let r = 1 / 0, n;
      for (let i of e) {
        let o = (0, Wi.default)(t, i);
        o > wl || o < r && (r = o, n = i);
      }
      return n;
    }
    __name(xl, "xl");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var It = class {
      static {
        __name(this, "It");
      }
      modelName;
      name;
      typeName;
      isList;
      isEnum;
      constructor(e, r, n, i, o) {
        this.modelName = e, this.name = r, this.typeName = n, this.isList = i, this.isEnum = o;
      }
      _toGraphQLInputType() {
        let e = this.isList ? "List" : "", r = this.isEnum ? "Enum" : "";
        return `${e}${r}${this.typeName}FieldRefInput<${this.modelName}>`;
      }
    };
    function et(t) {
      return t instanceof It;
    }
    __name(et, "et");
    u();
    c();
    p();
    m();
    d();
    l();
    var Rr = /* @__PURE__ */ Symbol();
    var En = /* @__PURE__ */ new WeakMap();
    var ve = class {
      static {
        __name(this, "ve");
      }
      constructor(e) {
        e === Rr ? En.set(this, `Prisma.${this._getName()}`) : En.set(this, `new Prisma.${this._getNamespace()}.${this._getName()}()`);
      }
      _getName() {
        return this.constructor.name;
      }
      toString() {
        return En.get(this);
      }
    };
    var Dt = class extends ve {
      static {
        __name(this, "Dt");
      }
      _getNamespace() {
        return "NullTypes";
      }
    };
    var Ot = class extends Dt {
      static {
        __name(this, "Ot");
      }
      #e;
    };
    wn(Ot, "DbNull");
    var kt = class extends Dt {
      static {
        __name(this, "kt");
      }
      #e;
    };
    wn(kt, "JsonNull");
    var _t = class extends Dt {
      static {
        __name(this, "_t");
      }
      #e;
    };
    wn(_t, "AnyNull");
    var Ar = { classes: { DbNull: Ot, JsonNull: kt, AnyNull: _t }, instances: { DbNull: new Ot(Rr), JsonNull: new kt(Rr), AnyNull: new _t(Rr) } };
    function wn(t, e) {
      Object.defineProperty(t, "name", { value: e, configurable: true });
    }
    __name(wn, "wn");
    u();
    c();
    p();
    m();
    d();
    l();
    var Zi = ": ";
    var Cr = class {
      static {
        __name(this, "Cr");
      }
      constructor(e, r) {
        this.name = e;
        this.value = r;
      }
      hasError = false;
      markAsError() {
        this.hasError = true;
      }
      getPrintWidth() {
        return this.name.length + this.value.getPrintWidth() + Zi.length;
      }
      write(e) {
        let r = new ge(this.name);
        this.hasError && r.underline().setColor(e.context.colors.red), e.write(r).write(Zi).write(this.value);
      }
    };
    var xn = class {
      static {
        __name(this, "xn");
      }
      arguments;
      errorMessages = [];
      constructor(e) {
        this.arguments = e;
      }
      write(e) {
        e.write(this.arguments);
      }
      addErrorMessage(e) {
        this.errorMessages.push(e);
      }
      renderAllMessages(e) {
        return this.errorMessages.map((r) => r(e)).join(`
`);
      }
    };
    function tt(t) {
      return new xn(eo(t));
    }
    __name(tt, "tt");
    function eo(t) {
      let e = new Xe();
      for (let [r, n] of Object.entries(t)) {
        let i = new Cr(r, to(n));
        e.addField(i);
      }
      return e;
    }
    __name(eo, "eo");
    function to(t) {
      if (typeof t == "string") return new z(JSON.stringify(t));
      if (typeof t == "number" || typeof t == "boolean") return new z(String(t));
      if (typeof t == "bigint") return new z(`${t}n`);
      if (t === null) return new z("null");
      if (t === void 0) return new z("undefined");
      if (Ke(t)) return new z(`new Prisma.Decimal("${t.toFixed()}")`);
      if (t instanceof Uint8Array) return h.isBuffer(t) ? new z(`Buffer.alloc(${t.byteLength})`) : new z(`new Uint8Array(${t.byteLength})`);
      if (t instanceof Date) {
        let e = br(t) ? t.toISOString() : "Invalid Date";
        return new z(`new Date("${e}")`);
      }
      return t instanceof ve ? new z(`Prisma.${t._getName()}`) : et(t) ? new z(`prisma.${Ce(t.modelName)}.$fields.${t.name}`) : Array.isArray(t) ? Pl(t) : typeof t == "object" ? eo(t) : new z(Object.prototype.toString.call(t));
    }
    __name(to, "to");
    function Pl(t) {
      let e = new Ye();
      for (let r of t) e.addItem(to(r));
      return e;
    }
    __name(Pl, "Pl");
    function Sr(t, e) {
      let r = e === "pretty" ? Ji : Tr, n = t.renderAllMessages(r), i = new He(0, { colors: r }).write(t).toString();
      return { message: n, args: i };
    }
    __name(Sr, "Sr");
    function Ir({ args: t, errors: e, errorFormat: r, callsite: n, originalMethod: i, clientVersion: o, globalOmit: s }) {
      let a = tt(t);
      for (let A of e) wr(A, a, s);
      let { message: f, args: v } = Sr(a, r), R = Er({ message: f, callsite: n, originalMethod: i, showColors: r === "pretty", callArguments: v });
      throw new Y(R, { clientVersion: o });
    }
    __name(Ir, "Ir");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function ye(t) {
      return t.replace(/^./, (e) => e.toLowerCase());
    }
    __name(ye, "ye");
    u();
    c();
    p();
    m();
    d();
    l();
    function no(t, e, r) {
      let n = ye(r);
      return !e.result || !(e.result.$allModels || e.result[n]) ? t : Tl({ ...t, ...ro(e.name, t, e.result.$allModels), ...ro(e.name, t, e.result[n]) });
    }
    __name(no, "no");
    function Tl(t) {
      let e = new fe(), r = /* @__PURE__ */ __name((n, i) => e.getOrCreate(n, () => i.has(n) ? [n] : (i.add(n), t[n] ? t[n].needs.flatMap((o) => r(o, i)) : [n])), "r");
      return hr(t, (n) => ({ ...n, needs: r(n.name, /* @__PURE__ */ new Set()) }));
    }
    __name(Tl, "Tl");
    function ro(t, e, r) {
      return r ? hr(r, ({ needs: n, compute: i }, o) => ({ name: o, needs: n ? Object.keys(n).filter((s) => n[s]) : [], compute: vl(e, o, i) })) : {};
    }
    __name(ro, "ro");
    function vl(t, e, r) {
      let n = t?.[e]?.compute;
      return n ? (i) => r({ ...i, [e]: n(i) }) : r;
    }
    __name(vl, "vl");
    function io(t, e) {
      if (!e) return t;
      let r = { ...t };
      for (let n of Object.values(e)) if (t[n.name]) for (let i of n.needs) r[i] = true;
      return r;
    }
    __name(io, "io");
    function oo(t, e) {
      if (!e) return t;
      let r = { ...t };
      for (let n of Object.values(e)) if (!t[n.name]) for (let i of n.needs) delete r[i];
      return r;
    }
    __name(oo, "oo");
    var Dr = class {
      static {
        __name(this, "Dr");
      }
      constructor(e, r) {
        this.extension = e;
        this.previous = r;
      }
      computedFieldsCache = new fe();
      modelExtensionsCache = new fe();
      queryCallbacksCache = new fe();
      clientExtensions = vt(() => this.extension.client ? { ...this.previous?.getAllClientExtensions(), ...this.extension.client } : this.previous?.getAllClientExtensions());
      batchCallbacks = vt(() => {
        let e = this.previous?.getAllBatchQueryCallbacks() ?? [], r = this.extension.query?.$__internalBatch;
        return r ? e.concat(r) : e;
      });
      getAllComputedFields(e) {
        return this.computedFieldsCache.getOrCreate(e, () => no(this.previous?.getAllComputedFields(e), this.extension, e));
      }
      getAllClientExtensions() {
        return this.clientExtensions.get();
      }
      getAllModelExtensions(e) {
        return this.modelExtensionsCache.getOrCreate(e, () => {
          let r = ye(e);
          return !this.extension.model || !(this.extension.model[r] || this.extension.model.$allModels) ? this.previous?.getAllModelExtensions(e) : { ...this.previous?.getAllModelExtensions(e), ...this.extension.model.$allModels, ...this.extension.model[r] };
        });
      }
      getAllQueryCallbacks(e, r) {
        return this.queryCallbacksCache.getOrCreate(`${e}:${r}`, () => {
          let n = this.previous?.getAllQueryCallbacks(e, r) ?? [], i = [], o = this.extension.query;
          return !o || !(o[e] || o.$allModels || o[r] || o.$allOperations) ? n : (o[e] !== void 0 && (o[e][r] !== void 0 && i.push(o[e][r]), o[e].$allOperations !== void 0 && i.push(o[e].$allOperations)), e !== "$none" && o.$allModels !== void 0 && (o.$allModels[r] !== void 0 && i.push(o.$allModels[r]), o.$allModels.$allOperations !== void 0 && i.push(o.$allModels.$allOperations)), o[r] !== void 0 && i.push(o[r]), o.$allOperations !== void 0 && i.push(o.$allOperations), n.concat(i));
        });
      }
      getAllBatchQueryCallbacks() {
        return this.batchCallbacks.get();
      }
    };
    var rt = class t {
      static {
        __name(this, "t");
      }
      constructor(e) {
        this.head = e;
      }
      static empty() {
        return new t();
      }
      static single(e) {
        return new t(new Dr(e));
      }
      isEmpty() {
        return this.head === void 0;
      }
      append(e) {
        return new t(new Dr(e, this.head));
      }
      getAllComputedFields(e) {
        return this.head?.getAllComputedFields(e);
      }
      getAllClientExtensions() {
        return this.head?.getAllClientExtensions();
      }
      getAllModelExtensions(e) {
        return this.head?.getAllModelExtensions(e);
      }
      getAllQueryCallbacks(e, r) {
        return this.head?.getAllQueryCallbacks(e, r) ?? [];
      }
      getAllBatchQueryCallbacks() {
        return this.head?.getAllBatchQueryCallbacks() ?? [];
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    var Or = class {
      static {
        __name(this, "Or");
      }
      constructor(e) {
        this.name = e;
      }
    };
    function so(t) {
      return t instanceof Or;
    }
    __name(so, "so");
    function ao(t) {
      return new Or(t);
    }
    __name(ao, "ao");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var lo = /* @__PURE__ */ Symbol();
    var Mt = class {
      static {
        __name(this, "Mt");
      }
      constructor(e) {
        if (e !== lo) throw new Error("Skip instance can not be constructed directly");
      }
      ifUndefined(e) {
        return e === void 0 ? kr : e;
      }
    };
    var kr = new Mt(lo);
    function he(t) {
      return t instanceof Mt;
    }
    __name(he, "he");
    var Rl = { findUnique: "findUnique", findUniqueOrThrow: "findUniqueOrThrow", findFirst: "findFirst", findFirstOrThrow: "findFirstOrThrow", findMany: "findMany", count: "aggregate", create: "createOne", createMany: "createMany", createManyAndReturn: "createManyAndReturn", update: "updateOne", updateMany: "updateMany", updateManyAndReturn: "updateManyAndReturn", upsert: "upsertOne", delete: "deleteOne", deleteMany: "deleteMany", executeRaw: "executeRaw", queryRaw: "queryRaw", aggregate: "aggregate", groupBy: "groupBy", runCommandRaw: "runCommandRaw", findRaw: "findRaw", aggregateRaw: "aggregateRaw" };
    var uo = "explicitly `undefined` values are not allowed";
    function _r({ modelName: t, action: e, args: r, runtimeDataModel: n, extensions: i = rt.empty(), callsite: o, clientMethod: s, errorFormat: a, clientVersion: f, previewFeatures: v, globalOmit: R }) {
      let A = new Pn({ runtimeDataModel: n, modelName: t, action: e, rootArgs: r, callsite: o, extensions: i, selectionPath: [], argumentPath: [], originalMethod: s, errorFormat: a, clientVersion: f, previewFeatures: v, globalOmit: R });
      return { modelName: t, action: Rl[e], query: Lt(r, A) };
    }
    __name(_r, "_r");
    function Lt({ select: t, include: e, ...r } = {}, n) {
      let i = r.omit;
      return delete r.omit, { arguments: po(r, n), selection: Al(t, e, i, n) };
    }
    __name(Lt, "Lt");
    function Al(t, e, r, n) {
      return t ? (e ? n.throwValidationError({ kind: "MutuallyExclusiveFields", firstField: "include", secondField: "select", selectionPath: n.getSelectionPath() }) : r && n.throwValidationError({ kind: "MutuallyExclusiveFields", firstField: "omit", secondField: "select", selectionPath: n.getSelectionPath() }), Dl(t, n)) : Cl(n, e, r);
    }
    __name(Al, "Al");
    function Cl(t, e, r) {
      let n = {};
      return t.modelOrType && !t.isRawAction() && (n.$composites = true, n.$scalars = true), e && Sl(n, e, t), Il(n, r, t), n;
    }
    __name(Cl, "Cl");
    function Sl(t, e, r) {
      for (let [n, i] of Object.entries(e)) {
        if (he(i)) continue;
        let o = r.nestSelection(n);
        if (Tn(i, o), i === false || i === void 0) {
          t[n] = false;
          continue;
        }
        let s = r.findField(n);
        if (s && s.kind !== "object" && r.throwValidationError({ kind: "IncludeOnScalar", selectionPath: r.getSelectionPath().concat(n), outputType: r.getOutputTypeDescription() }), s) {
          t[n] = Lt(i === true ? {} : i, o);
          continue;
        }
        if (i === true) {
          t[n] = true;
          continue;
        }
        t[n] = Lt(i, o);
      }
    }
    __name(Sl, "Sl");
    function Il(t, e, r) {
      let n = r.getComputedFields(), i = { ...r.getGlobalOmit(), ...e }, o = oo(i, n);
      for (let [s, a] of Object.entries(o)) {
        if (he(a)) continue;
        Tn(a, r.nestSelection(s));
        let f = r.findField(s);
        n?.[s] && !f || (t[s] = !a);
      }
    }
    __name(Il, "Il");
    function Dl(t, e) {
      let r = {}, n = e.getComputedFields(), i = io(t, n);
      for (let [o, s] of Object.entries(i)) {
        if (he(s)) continue;
        let a = e.nestSelection(o);
        Tn(s, a);
        let f = e.findField(o);
        if (!(n?.[o] && !f)) {
          if (s === false || s === void 0 || he(s)) {
            r[o] = false;
            continue;
          }
          if (s === true) {
            f?.kind === "object" ? r[o] = Lt({}, a) : r[o] = true;
            continue;
          }
          r[o] = Lt(s, a);
        }
      }
      return r;
    }
    __name(Dl, "Dl");
    function co(t, e) {
      if (t === null) return null;
      if (typeof t == "string" || typeof t == "number" || typeof t == "boolean") return t;
      if (typeof t == "bigint") return { $type: "BigInt", value: String(t) };
      if (We(t)) {
        if (br(t)) return { $type: "DateTime", value: t.toISOString() };
        e.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: e.getSelectionPath(), argumentPath: e.getArgumentPath(), argument: { name: e.getArgumentName(), typeNames: ["Date"] }, underlyingError: "Provided Date object is invalid" });
      }
      if (so(t)) return { $type: "Param", value: t.name };
      if (et(t)) return { $type: "FieldRef", value: { _ref: t.name, _container: t.modelName } };
      if (Array.isArray(t)) return Ol(t, e);
      if (ArrayBuffer.isView(t)) {
        let { buffer: r, byteOffset: n, byteLength: i } = t;
        return { $type: "Bytes", value: h.from(r, n, i).toString("base64") };
      }
      if (kl(t)) return t.values;
      if (Ke(t)) return { $type: "Decimal", value: t.toFixed() };
      if (t instanceof ve) {
        if (t !== Ar.instances[t._getName()]) throw new Error("Invalid ObjectEnumValue");
        return { $type: "Enum", value: t._getName() };
      }
      if (_l(t)) return t.toJSON();
      if (typeof t == "object") return po(t, e);
      e.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: e.getSelectionPath(), argumentPath: e.getArgumentPath(), argument: { name: e.getArgumentName(), typeNames: [] }, underlyingError: `We could not serialize ${Object.prototype.toString.call(t)} value. Serialize the object to JSON or implement a ".toJSON()" method on it` });
    }
    __name(co, "co");
    function po(t, e) {
      if (t.$type) return { $type: "Raw", value: t };
      let r = {};
      for (let n in t) {
        let i = t[n], o = e.nestArgument(n);
        he(i) || (i !== void 0 ? r[n] = co(i, o) : e.isPreviewFeatureOn("strictUndefinedChecks") && e.throwValidationError({ kind: "InvalidArgumentValue", argumentPath: o.getArgumentPath(), selectionPath: e.getSelectionPath(), argument: { name: e.getArgumentName(), typeNames: [] }, underlyingError: uo }));
      }
      return r;
    }
    __name(po, "po");
    function Ol(t, e) {
      let r = [];
      for (let n = 0; n < t.length; n++) {
        let i = e.nestArgument(String(n)), o = t[n];
        if (o === void 0 || he(o)) {
          let s = o === void 0 ? "undefined" : "Prisma.skip";
          e.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: i.getSelectionPath(), argumentPath: i.getArgumentPath(), argument: { name: `${e.getArgumentName()}[${n}]`, typeNames: [] }, underlyingError: `Can not use \`${s}\` value within array. Use \`null\` or filter out \`${s}\` values` });
        }
        r.push(co(o, i));
      }
      return r;
    }
    __name(Ol, "Ol");
    function kl(t) {
      return typeof t == "object" && t !== null && t.__prismaRawParameters__ === true;
    }
    __name(kl, "kl");
    function _l(t) {
      return typeof t == "object" && t !== null && typeof t.toJSON == "function";
    }
    __name(_l, "_l");
    function Tn(t, e) {
      t === void 0 && e.isPreviewFeatureOn("strictUndefinedChecks") && e.throwValidationError({ kind: "InvalidSelectionValue", selectionPath: e.getSelectionPath(), underlyingError: uo });
    }
    __name(Tn, "Tn");
    var Pn = class t {
      static {
        __name(this, "t");
      }
      constructor(e) {
        this.params = e;
        this.params.modelName && (this.modelOrType = this.params.runtimeDataModel.models[this.params.modelName] ?? this.params.runtimeDataModel.types[this.params.modelName]);
      }
      modelOrType;
      throwValidationError(e) {
        Ir({ errors: [e], originalMethod: this.params.originalMethod, args: this.params.rootArgs ?? {}, callsite: this.params.callsite, errorFormat: this.params.errorFormat, clientVersion: this.params.clientVersion, globalOmit: this.params.globalOmit });
      }
      getSelectionPath() {
        return this.params.selectionPath;
      }
      getArgumentPath() {
        return this.params.argumentPath;
      }
      getArgumentName() {
        return this.params.argumentPath[this.params.argumentPath.length - 1];
      }
      getOutputTypeDescription() {
        if (!(!this.params.modelName || !this.modelOrType)) return { name: this.params.modelName, fields: this.modelOrType.fields.map((e) => ({ name: e.name, typeName: "boolean", isRelation: e.kind === "object" })) };
      }
      isRawAction() {
        return ["executeRaw", "queryRaw", "runCommandRaw", "findRaw", "aggregateRaw"].includes(this.params.action);
      }
      isPreviewFeatureOn(e) {
        return this.params.previewFeatures.includes(e);
      }
      getComputedFields() {
        if (this.params.modelName) return this.params.extensions.getAllComputedFields(this.params.modelName);
      }
      findField(e) {
        return this.modelOrType?.fields.find((r) => r.name === e);
      }
      nestSelection(e) {
        let r = this.findField(e), n = r?.kind === "object" ? r.type : void 0;
        return new t({ ...this.params, modelName: n, selectionPath: this.params.selectionPath.concat(e) });
      }
      getGlobalOmit() {
        return this.params.modelName && this.shouldApplyGlobalOmit() ? this.params.globalOmit?.[Ce(this.params.modelName)] ?? {} : {};
      }
      shouldApplyGlobalOmit() {
        switch (this.params.action) {
          case "findFirst":
          case "findFirstOrThrow":
          case "findUniqueOrThrow":
          case "findMany":
          case "upsert":
          case "findUnique":
          case "createManyAndReturn":
          case "create":
          case "update":
          case "updateManyAndReturn":
          case "delete":
            return true;
          case "executeRaw":
          case "aggregateRaw":
          case "runCommandRaw":
          case "findRaw":
          case "createMany":
          case "deleteMany":
          case "groupBy":
          case "updateMany":
          case "count":
          case "aggregate":
          case "queryRaw":
            return false;
          default:
            Fe(this.params.action, "Unknown action");
        }
      }
      nestArgument(e) {
        return new t({ ...this.params, argumentPath: this.params.argumentPath.concat(e) });
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function mo(t) {
      if (!t._hasPreviewFlag("metrics")) throw new Y("`metrics` preview feature must be enabled in order to access metrics API", { clientVersion: t._clientVersion });
    }
    __name(mo, "mo");
    var nt = class {
      static {
        __name(this, "nt");
      }
      _client;
      constructor(e) {
        this._client = e;
      }
      prometheus(e) {
        return mo(this._client), this._client._engine.metrics({ format: "prometheus", ...e });
      }
      json(e) {
        return mo(this._client), this._client._engine.metrics({ format: "json", ...e });
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function fo(t, e) {
      let r = vt(() => Ml(e));
      Object.defineProperty(t, "dmmf", { get: /* @__PURE__ */ __name(() => r.get(), "get") });
    }
    __name(fo, "fo");
    function Ml(t) {
      throw new Error("Prisma.dmmf is not available when running in edge runtimes.");
    }
    __name(Ml, "Ml");
    u();
    c();
    p();
    m();
    d();
    l();
    var Rn = /* @__PURE__ */ new WeakMap();
    var Mr = "$$PrismaTypedSql";
    var Ft = class {
      static {
        __name(this, "Ft");
      }
      constructor(e, r) {
        Rn.set(this, { sql: e, values: r }), Object.defineProperty(this, Mr, { value: Mr });
      }
      get sql() {
        return Rn.get(this).sql;
      }
      get values() {
        return Rn.get(this).values;
      }
    };
    function go(t) {
      return (...e) => new Ft(t, e);
    }
    __name(go, "go");
    function Lr(t) {
      return t != null && t[Mr] === Mr;
    }
    __name(Lr, "Lr");
    u();
    c();
    p();
    m();
    d();
    l();
    var Ls = bt(un());
    u();
    c();
    p();
    m();
    d();
    l();
    yo();
    Ti();
    Si();
    u();
    c();
    p();
    m();
    d();
    l();
    var ne = class t {
      static {
        __name(this, "t");
      }
      constructor(e, r) {
        if (e.length - 1 !== r.length) throw e.length === 0 ? new TypeError("Expected at least 1 string") : new TypeError(`Expected ${e.length} strings to have ${e.length - 1} values`);
        let n = r.reduce((s, a) => s + (a instanceof t ? a.values.length : 1), 0);
        this.values = new Array(n), this.strings = new Array(n + 1), this.strings[0] = e[0];
        let i = 0, o = 0;
        for (; i < r.length; ) {
          let s = r[i++], a = e[i];
          if (s instanceof t) {
            this.strings[o] += s.strings[0];
            let f = 0;
            for (; f < s.values.length; ) this.values[o++] = s.values[f++], this.strings[o] = s.strings[f];
            this.strings[o] += a;
          } else this.values[o++] = s, this.strings[o] = a;
        }
      }
      get sql() {
        let e = this.strings.length, r = 1, n = this.strings[0];
        for (; r < e; ) n += `?${this.strings[r++]}`;
        return n;
      }
      get statement() {
        let e = this.strings.length, r = 1, n = this.strings[0];
        for (; r < e; ) n += `:${r}${this.strings[r++]}`;
        return n;
      }
      get text() {
        let e = this.strings.length, r = 1, n = this.strings[0];
        for (; r < e; ) n += `$${r}${this.strings[r++]}`;
        return n;
      }
      inspect() {
        return { sql: this.sql, statement: this.statement, text: this.text, values: this.values };
      }
    };
    function ho(t, e = ",", r = "", n = "") {
      if (t.length === 0) throw new TypeError("Expected `join([])` to be called with an array of multiple elements, but got an empty array");
      return new ne([r, ...Array(t.length - 1).fill(e), n], t);
    }
    __name(ho, "ho");
    function An(t) {
      return new ne([t], []);
    }
    __name(An, "An");
    var bo = An("");
    function Cn(t, ...e) {
      return new ne(t, e);
    }
    __name(Cn, "Cn");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function Nt(t) {
      return { getKeys() {
        return Object.keys(t);
      }, getPropertyValue(e) {
        return t[e];
      } };
    }
    __name(Nt, "Nt");
    u();
    c();
    p();
    m();
    d();
    l();
    function Z(t, e) {
      return { getKeys() {
        return [t];
      }, getPropertyValue() {
        return e();
      } };
    }
    __name(Z, "Z");
    u();
    c();
    p();
    m();
    d();
    l();
    function Ne(t) {
      let e = new fe();
      return { getKeys() {
        return t.getKeys();
      }, getPropertyValue(r) {
        return e.getOrCreate(r, () => t.getPropertyValue(r));
      }, getPropertyDescriptor(r) {
        return t.getPropertyDescriptor?.(r);
      } };
    }
    __name(Ne, "Ne");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Nr = { enumerable: true, configurable: true, writable: true };
    function Ur(t) {
      let e = new Set(t);
      return { getPrototypeOf: /* @__PURE__ */ __name(() => Object.prototype, "getPrototypeOf"), getOwnPropertyDescriptor: /* @__PURE__ */ __name(() => Nr, "getOwnPropertyDescriptor"), has: /* @__PURE__ */ __name((r, n) => e.has(n), "has"), set: /* @__PURE__ */ __name((r, n, i) => e.add(n) && Reflect.set(r, n, i), "set"), ownKeys: /* @__PURE__ */ __name(() => [...e], "ownKeys") };
    }
    __name(Ur, "Ur");
    var Eo = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
    function ce(t, e) {
      let r = Ll(e), n = /* @__PURE__ */ new Set(), i = new Proxy(t, { get(o, s) {
        if (n.has(s)) return o[s];
        let a = r.get(s);
        return a ? a.getPropertyValue(s) : o[s];
      }, has(o, s) {
        if (n.has(s)) return true;
        let a = r.get(s);
        return a ? a.has?.(s) ?? true : Reflect.has(o, s);
      }, ownKeys(o) {
        let s = wo(Reflect.ownKeys(o), r), a = wo(Array.from(r.keys()), r);
        return [.../* @__PURE__ */ new Set([...s, ...a, ...n])];
      }, set(o, s, a) {
        return r.get(s)?.getPropertyDescriptor?.(s)?.writable === false ? false : (n.add(s), Reflect.set(o, s, a));
      }, getOwnPropertyDescriptor(o, s) {
        let a = Reflect.getOwnPropertyDescriptor(o, s);
        if (a && !a.configurable) return a;
        let f = r.get(s);
        return f ? f.getPropertyDescriptor ? { ...Nr, ...f?.getPropertyDescriptor(s) } : Nr : a;
      }, defineProperty(o, s, a) {
        return n.add(s), Reflect.defineProperty(o, s, a);
      }, getPrototypeOf: /* @__PURE__ */ __name(() => Object.prototype, "getPrototypeOf") });
      return i[Eo] = function() {
        let o = { ...this };
        return delete o[Eo], o;
      }, i;
    }
    __name(ce, "ce");
    function Ll(t) {
      let e = /* @__PURE__ */ new Map();
      for (let r of t) {
        let n = r.getKeys();
        for (let i of n) e.set(i, r);
      }
      return e;
    }
    __name(Ll, "Ll");
    function wo(t, e) {
      return t.filter((r) => e.get(r)?.has?.(r) ?? true);
    }
    __name(wo, "wo");
    u();
    c();
    p();
    m();
    d();
    l();
    function it(t) {
      return { getKeys() {
        return t;
      }, has() {
        return false;
      }, getPropertyValue() {
      } };
    }
    __name(it, "it");
    u();
    c();
    p();
    m();
    d();
    l();
    function ot(t, e) {
      return { batch: t, transaction: e?.kind === "batch" ? { isolationLevel: e.options.isolationLevel } : void 0 };
    }
    __name(ot, "ot");
    u();
    c();
    p();
    m();
    d();
    l();
    function xo(t) {
      if (t === void 0) return "";
      let e = tt(t);
      return new He(0, { colors: Tr }).write(e).toString();
    }
    __name(xo, "xo");
    u();
    c();
    p();
    m();
    d();
    l();
    var Fl = "P2037";
    function st({ error: t, user_facing_error: e }, r, n) {
      return e.error_code ? new X(Nl(e, n), { code: e.error_code, clientVersion: r, meta: e.meta, batchRequestIdx: e.batch_request_idx }) : new Q(t, { clientVersion: r, batchRequestIdx: e.batch_request_idx });
    }
    __name(st, "st");
    function Nl(t, e) {
      let r = t.message;
      return (e === "postgresql" || e === "postgres" || e === "mysql") && t.error_code === Fl && (r += `
Prisma Accelerate has built-in connection pooling to prevent such errors: https://pris.ly/client/error-accelerate`), r;
    }
    __name(Nl, "Nl");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Sn = class {
      static {
        __name(this, "Sn");
      }
      getLocation() {
        return null;
      }
    };
    function Ie(t) {
      return typeof $EnabledCallSite == "function" && t !== "minimal" ? new $EnabledCallSite() : new Sn();
    }
    __name(Ie, "Ie");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Po = { _avg: true, _count: true, _sum: true, _min: true, _max: true };
    function at(t = {}) {
      let e = ql(t);
      return Object.entries(e).reduce((n, [i, o]) => (Po[i] !== void 0 ? n.select[i] = { select: o } : n[i] = o, n), { select: {} });
    }
    __name(at, "at");
    function ql(t = {}) {
      return typeof t._count == "boolean" ? { ...t, _count: { _all: t._count } } : t;
    }
    __name(ql, "ql");
    function qr(t = {}) {
      return (e) => (typeof t._count == "boolean" && (e._count = e._count._all), e);
    }
    __name(qr, "qr");
    function To(t, e) {
      let r = qr(t);
      return e({ action: "aggregate", unpacker: r, argsMapper: at })(t);
    }
    __name(To, "To");
    u();
    c();
    p();
    m();
    d();
    l();
    function Vl(t = {}) {
      let { select: e, ...r } = t;
      return typeof e == "object" ? at({ ...r, _count: e }) : at({ ...r, _count: { _all: true } });
    }
    __name(Vl, "Vl");
    function Bl(t = {}) {
      return typeof t.select == "object" ? (e) => qr(t)(e)._count : (e) => qr(t)(e)._count._all;
    }
    __name(Bl, "Bl");
    function vo(t, e) {
      return e({ action: "count", unpacker: Bl(t), argsMapper: Vl })(t);
    }
    __name(vo, "vo");
    u();
    c();
    p();
    m();
    d();
    l();
    function $l(t = {}) {
      let e = at(t);
      if (Array.isArray(e.by)) for (let r of e.by) typeof r == "string" && (e.select[r] = true);
      else typeof e.by == "string" && (e.select[e.by] = true);
      return e;
    }
    __name($l, "$l");
    function jl(t = {}) {
      return (e) => (typeof t?._count == "boolean" && e.forEach((r) => {
        r._count = r._count._all;
      }), e);
    }
    __name(jl, "jl");
    function Ro(t, e) {
      return e({ action: "groupBy", unpacker: jl(t), argsMapper: $l })(t);
    }
    __name(Ro, "Ro");
    function Ao(t, e, r) {
      if (e === "aggregate") return (n) => To(n, r);
      if (e === "count") return (n) => vo(n, r);
      if (e === "groupBy") return (n) => Ro(n, r);
    }
    __name(Ao, "Ao");
    u();
    c();
    p();
    m();
    d();
    l();
    function Co(t, e) {
      let r = e.fields.filter((i) => !i.relationName), n = Ni(r, "name");
      return new Proxy({}, { get(i, o) {
        if (o in i || typeof o == "symbol") return i[o];
        let s = n[o];
        if (s) return new It(t, o, s.type, s.isList, s.kind === "enum");
      }, ...Ur(Object.keys(n)) });
    }
    __name(Co, "Co");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var So = /* @__PURE__ */ __name((t) => Array.isArray(t) ? t : t.split("."), "So");
    var In = /* @__PURE__ */ __name((t, e) => So(e).reduce((r, n) => r && r[n], t), "In");
    var Io = /* @__PURE__ */ __name((t, e, r) => So(e).reduceRight((n, i, o, s) => Object.assign({}, In(t, s.slice(0, o)), { [i]: n }), r), "Io");
    function Ql(t, e) {
      return t === void 0 || e === void 0 ? [] : [...e, "select", t];
    }
    __name(Ql, "Ql");
    function Gl(t, e, r) {
      return e === void 0 ? t ?? {} : Io(e, r, t || true);
    }
    __name(Gl, "Gl");
    function Dn(t, e, r, n, i, o) {
      let a = t._runtimeDataModel.models[e].fields.reduce((f, v) => ({ ...f, [v.name]: v }), {});
      return (f) => {
        let v = Ie(t._errorFormat), R = Ql(n, i), A = Gl(f, o, R), I = r({ dataPath: R, callsite: v })(A), C = Jl(t, e);
        return new Proxy(I, { get(L, D) {
          if (!C.includes(D)) return L[D];
          let Ee = [a[D].type, r, D], ee = [R, A];
          return Dn(t, ...Ee, ...ee);
        }, ...Ur([...C, ...Object.getOwnPropertyNames(I)]) });
      };
    }
    __name(Dn, "Dn");
    function Jl(t, e) {
      return t._runtimeDataModel.models[e].fields.filter((r) => r.kind === "object").map((r) => r.name);
    }
    __name(Jl, "Jl");
    var Wl = ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "create", "update", "upsert", "delete"];
    var Kl = ["aggregate", "count", "groupBy"];
    function On(t, e) {
      let r = t._extensions.getAllModelExtensions(e) ?? {}, n = [Hl(t, e), Yl(t, e), Nt(r), Z("name", () => e), Z("$name", () => e), Z("$parent", () => t._appliedParent)];
      return ce({}, n);
    }
    __name(On, "On");
    function Hl(t, e) {
      let r = ye(e), n = Object.keys(Rt).concat("count");
      return { getKeys() {
        return n;
      }, getPropertyValue(i) {
        let o = i, s = /* @__PURE__ */ __name((a) => (f) => {
          let v = Ie(t._errorFormat);
          return t._createPrismaPromise((R) => {
            let A = { args: f, dataPath: [], action: o, model: e, clientMethod: `${r}.${i}`, jsModelName: r, transaction: R, callsite: v };
            return t._request({ ...A, ...a });
          }, { action: o, args: f, model: e });
        }, "s");
        return Wl.includes(o) ? Dn(t, e, s) : zl(i) ? Ao(t, i, s) : s({});
      } };
    }
    __name(Hl, "Hl");
    function zl(t) {
      return Kl.includes(t);
    }
    __name(zl, "zl");
    function Yl(t, e) {
      return Ne(Z("fields", () => {
        let r = t._runtimeDataModel.models[e];
        return Co(e, r);
      }));
    }
    __name(Yl, "Yl");
    u();
    c();
    p();
    m();
    d();
    l();
    function Do(t) {
      return t.replace(/^./, (e) => e.toUpperCase());
    }
    __name(Do, "Do");
    var kn = /* @__PURE__ */ Symbol();
    function Ut(t) {
      let e = [Xl(t), Zl(t), Z(kn, () => t), Z("$parent", () => t._appliedParent)], r = t._extensions.getAllClientExtensions();
      return r && e.push(Nt(r)), ce(t, e);
    }
    __name(Ut, "Ut");
    function Xl(t) {
      let e = Object.getPrototypeOf(t._originalClient), r = [...new Set(Object.getOwnPropertyNames(e))];
      return { getKeys() {
        return r;
      }, getPropertyValue(n) {
        return t[n];
      } };
    }
    __name(Xl, "Xl");
    function Zl(t) {
      let e = Object.keys(t._runtimeDataModel.models), r = e.map(ye), n = [...new Set(e.concat(r))];
      return Ne({ getKeys() {
        return n;
      }, getPropertyValue(i) {
        let o = Do(i);
        if (t._runtimeDataModel.models[o] !== void 0) return On(t, o);
        if (t._runtimeDataModel.models[i] !== void 0) return On(t, i);
      }, getPropertyDescriptor(i) {
        if (!r.includes(i)) return { enumerable: false };
      } });
    }
    __name(Zl, "Zl");
    function Oo(t) {
      return t[kn] ? t[kn] : t;
    }
    __name(Oo, "Oo");
    function ko(t) {
      if (typeof t == "function") return t(this);
      if (t.client?.__AccelerateEngine) {
        let r = t.client.__AccelerateEngine;
        this._originalClient._engine = new r(this._originalClient._accelerateEngineConfig);
      }
      let e = Object.create(this._originalClient, { _extensions: { value: this._extensions.append(t) }, _appliedParent: { value: this, configurable: true }, $on: { value: void 0 } });
      return Ut(e);
    }
    __name(ko, "ko");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function _o({ result: t, modelName: e, select: r, omit: n, extensions: i }) {
      let o = i.getAllComputedFields(e);
      if (!o) return t;
      let s = [], a = [];
      for (let f of Object.values(o)) {
        if (n) {
          if (n[f.name]) continue;
          let v = f.needs.filter((R) => n[R]);
          v.length > 0 && a.push(it(v));
        } else if (r) {
          if (!r[f.name]) continue;
          let v = f.needs.filter((R) => !r[R]);
          v.length > 0 && a.push(it(v));
        }
        eu(t, f.needs) && s.push(tu(f, ce(t, s)));
      }
      return s.length > 0 || a.length > 0 ? ce(t, [...s, ...a]) : t;
    }
    __name(_o, "_o");
    function eu(t, e) {
      return e.every((r) => fn(t, r));
    }
    __name(eu, "eu");
    function tu(t, e) {
      return Ne(Z(t.name, () => t.compute(e)));
    }
    __name(tu, "tu");
    u();
    c();
    p();
    m();
    d();
    l();
    function Vr({ visitor: t, result: e, args: r, runtimeDataModel: n, modelName: i }) {
      if (Array.isArray(e)) {
        for (let s = 0; s < e.length; s++) e[s] = Vr({ result: e[s], args: r, modelName: i, runtimeDataModel: n, visitor: t });
        return e;
      }
      let o = t(e, i, r) ?? e;
      return r.include && Mo({ includeOrSelect: r.include, result: o, parentModelName: i, runtimeDataModel: n, visitor: t }), r.select && Mo({ includeOrSelect: r.select, result: o, parentModelName: i, runtimeDataModel: n, visitor: t }), o;
    }
    __name(Vr, "Vr");
    function Mo({ includeOrSelect: t, result: e, parentModelName: r, runtimeDataModel: n, visitor: i }) {
      for (let [o, s] of Object.entries(t)) {
        if (!s || e[o] == null || he(s)) continue;
        let f = n.models[r].fields.find((R) => R.name === o);
        if (!f || f.kind !== "object" || !f.relationName) continue;
        let v = typeof s == "object" ? s : {};
        e[o] = Vr({ visitor: i, result: e[o], args: v, modelName: f.type, runtimeDataModel: n });
      }
    }
    __name(Mo, "Mo");
    function Lo({ result: t, modelName: e, args: r, extensions: n, runtimeDataModel: i, globalOmit: o }) {
      return n.isEmpty() || t == null || typeof t != "object" || !i.models[e] ? t : Vr({ result: t, args: r ?? {}, modelName: e, runtimeDataModel: i, visitor: /* @__PURE__ */ __name((a, f, v) => {
        let R = ye(f);
        return _o({ result: a, modelName: R, select: v.select, omit: v.select ? void 0 : { ...o?.[R], ...v.omit }, extensions: n });
      }, "visitor") });
    }
    __name(Lo, "Lo");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var ru = ["$connect", "$disconnect", "$on", "$transaction", "$extends"];
    var Fo = ru;
    function No(t) {
      if (t instanceof ne) return nu(t);
      if (Lr(t)) return iu(t);
      if (Array.isArray(t)) {
        let r = [t[0]];
        for (let n = 1; n < t.length; n++) r[n] = qt(t[n]);
        return r;
      }
      let e = {};
      for (let r in t) e[r] = qt(t[r]);
      return e;
    }
    __name(No, "No");
    function nu(t) {
      return new ne(t.strings, t.values);
    }
    __name(nu, "nu");
    function iu(t) {
      return new Ft(t.sql, t.values);
    }
    __name(iu, "iu");
    function qt(t) {
      if (typeof t != "object" || t == null || t instanceof ve || et(t)) return t;
      if (Ke(t)) return new xe(t.toFixed());
      if (We(t)) return /* @__PURE__ */ new Date(+t);
      if (ArrayBuffer.isView(t)) return t.slice(0);
      if (Array.isArray(t)) {
        let e = t.length, r;
        for (r = Array(e); e--; ) r[e] = qt(t[e]);
        return r;
      }
      if (typeof t == "object") {
        let e = {};
        for (let r in t) r === "__proto__" ? Object.defineProperty(e, r, { value: qt(t[r]), configurable: true, enumerable: true, writable: true }) : e[r] = qt(t[r]);
        return e;
      }
      Fe(t, "Unknown value");
    }
    __name(qt, "qt");
    function qo(t, e, r, n = 0) {
      return t._createPrismaPromise((i) => {
        let o = e.customDataProxyFetch;
        return "transaction" in e && i !== void 0 && (e.transaction?.kind === "batch" && e.transaction.lock.then(), e.transaction = i), n === r.length ? t._executeRequest(e) : r[n]({ model: e.model, operation: e.model ? e.action : e.clientMethod, args: No(e.args ?? {}), __internalParams: e, query: /* @__PURE__ */ __name((s, a = e) => {
          let f = a.customDataProxyFetch;
          return a.customDataProxyFetch = jo(o, f), a.args = s, qo(t, a, r, n + 1);
        }, "query") });
      });
    }
    __name(qo, "qo");
    function Vo(t, e) {
      let { jsModelName: r, action: n, clientMethod: i } = e, o = r ? n : i;
      if (t._extensions.isEmpty()) return t._executeRequest(e);
      let s = t._extensions.getAllQueryCallbacks(r ?? "$none", o);
      return qo(t, e, s);
    }
    __name(Vo, "Vo");
    function Bo(t) {
      return (e) => {
        let r = { requests: e }, n = e[0].extensions.getAllBatchQueryCallbacks();
        return n.length ? $o(r, n, 0, t) : t(r);
      };
    }
    __name(Bo, "Bo");
    function $o(t, e, r, n) {
      if (r === e.length) return n(t);
      let i = t.customDataProxyFetch, o = t.requests[0].transaction;
      return e[r]({ args: { queries: t.requests.map((s) => ({ model: s.modelName, operation: s.action, args: s.args })), transaction: o ? { isolationLevel: o.kind === "batch" ? o.isolationLevel : void 0 } : void 0 }, __internalParams: t, query(s, a = t) {
        let f = a.customDataProxyFetch;
        return a.customDataProxyFetch = jo(i, f), $o(a, e, r + 1, n);
      } });
    }
    __name($o, "$o");
    var Uo = /* @__PURE__ */ __name((t) => t, "Uo");
    function jo(t = Uo, e = Uo) {
      return (r) => t(e(r));
    }
    __name(jo, "jo");
    u();
    c();
    p();
    m();
    d();
    l();
    var Qo = j("prisma:client");
    var Go = { Vercel: "vercel", "Netlify CI": "netlify" };
    function Jo({ postinstall: t, ciName: e, clientVersion: r, generator: n }) {
      if (Qo("checkPlatformCaching:postinstall", t), Qo("checkPlatformCaching:ciName", e), t === true && !(n?.output && typeof (n.output.fromEnvVar ?? n.output.value) == "string") && e && e in Go) {
        let i = `Prisma has detected that this project was built on ${e}, which caches dependencies. This leads to an outdated Prisma Client because Prisma's auto-generation isn't triggered. To fix this, make sure to run the \`prisma generate\` command during the build process.

Learn how: https://pris.ly/d/${Go[e]}-build`;
        throw console.error(i), new M(i, r);
      }
    }
    __name(Jo, "Jo");
    u();
    c();
    p();
    m();
    d();
    l();
    function Wo(t, e) {
      return t ? t.datasources ? t.datasources : t.datasourceUrl ? { [e[0]]: { url: t.datasourceUrl } } : {} : {};
    }
    __name(Wo, "Wo");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    function Ko(t, e) {
      throw new Error(e);
    }
    __name(Ko, "Ko");
    function ou(t) {
      return t !== null && typeof t == "object" && typeof t.$type == "string";
    }
    __name(ou, "ou");
    function su(t, e) {
      let r = {};
      for (let n of Object.keys(t)) r[n] = e(t[n], n);
      return r;
    }
    __name(su, "su");
    function lt(t) {
      return t === null ? t : Array.isArray(t) ? t.map(lt) : typeof t == "object" ? ou(t) ? au(t) : t.constructor !== null && t.constructor.name !== "Object" ? t : su(t, lt) : t;
    }
    __name(lt, "lt");
    function au({ $type: t, value: e }) {
      switch (t) {
        case "BigInt":
          return BigInt(e);
        case "Bytes": {
          let { buffer: r, byteOffset: n, byteLength: i } = h.from(e, "base64");
          return new Uint8Array(r, n, i);
        }
        case "DateTime":
          return new Date(e);
        case "Decimal":
          return new P(e);
        case "Json":
          return JSON.parse(e);
        default:
          Ko(e, "Unknown tagged value");
      }
    }
    __name(au, "au");
    var Ho = "6.19.3";
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var uu = /* @__PURE__ */ __name(() => globalThis.process?.release?.name === "node", "uu");
    var cu = /* @__PURE__ */ __name(() => !!globalThis.Bun || !!globalThis.process?.versions?.bun, "cu");
    var pu = /* @__PURE__ */ __name(() => !!globalThis.Deno, "pu");
    var mu = /* @__PURE__ */ __name(() => typeof globalThis.Netlify == "object", "mu");
    var du = /* @__PURE__ */ __name(() => typeof globalThis.EdgeRuntime == "object", "du");
    var fu = /* @__PURE__ */ __name(() => globalThis.navigator?.userAgent === "Cloudflare-Workers", "fu");
    function gu() {
      return [[mu, "netlify"], [du, "edge-light"], [fu, "workerd"], [pu, "deno"], [cu, "bun"], [uu, "node"]].flatMap((r) => r[0]() ? [r[1]] : []).at(0) ?? "";
    }
    __name(gu, "gu");
    var yu = { node: "Node.js", workerd: "Cloudflare Workers", deno: "Deno and Deno Deploy", netlify: "Netlify Edge Functions", "edge-light": "Edge Runtime (Vercel Edge Functions, Vercel Edge Middleware, Next.js (Pages Router) Edge API Routes, Next.js (App Router) Edge Route Handlers or Next.js Middleware)" };
    function ut() {
      let t = gu();
      return { id: t, prettyName: yu[t] || t, isEdge: ["workerd", "deno", "netlify", "edge-light"].includes(t) };
    }
    __name(ut, "ut");
    function ct({ inlineDatasources: t, overrideDatasources: e, env: r, clientVersion: n }) {
      let i, o = Object.keys(t)[0], s = t[o]?.url, a = e[o]?.url;
      if (o === void 0 ? i = void 0 : a ? i = a : s?.value ? i = s.value : s?.fromEnvVar && (i = r[s.fromEnvVar]), s?.fromEnvVar !== void 0 && i === void 0) throw ut().id === "workerd" ? new M(`error: Environment variable not found: ${s.fromEnvVar}.

In Cloudflare module Workers, environment variables are available only in the Worker's \`env\` parameter of \`fetch\`.
To solve this, provide the connection string directly: https://pris.ly/d/cloudflare-datasource-url`, n) : new M(`error: Environment variable not found: ${s.fromEnvVar}.`, n);
      if (i === void 0) throw new M("error: Missing URL environment variable, value, or override.", n);
      return i;
    }
    __name(ct, "ct");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Br = class extends Error {
      static {
        __name(this, "Br");
      }
      clientVersion;
      cause;
      constructor(e, r) {
        super(e), this.clientVersion = r.clientVersion, this.cause = r.cause;
      }
      get [Symbol.toStringTag]() {
        return this.name;
      }
    };
    var ie = class extends Br {
      static {
        __name(this, "ie");
      }
      isRetryable;
      constructor(e, r) {
        super(e, r), this.isRetryable = r.isRetryable ?? true;
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function _(t, e) {
      return { ...t, isRetryable: e };
    }
    __name(_, "_");
    var Ue = class extends ie {
      static {
        __name(this, "Ue");
      }
      name = "InvalidDatasourceError";
      code = "P6001";
      constructor(e, r) {
        super(e, _(r, false));
      }
    };
    O(Ue, "InvalidDatasourceError");
    function zo(t) {
      let e = { clientVersion: t.clientVersion }, r = Object.keys(t.inlineDatasources)[0], n = ct({ inlineDatasources: t.inlineDatasources, overrideDatasources: t.overrideDatasources, clientVersion: t.clientVersion, env: { ...t.env, ...typeof g < "u" ? g.env : {} } }), i;
      try {
        i = new URL(n);
      } catch {
        throw new Ue(`Error validating datasource \`${r}\`: the URL must start with the protocol \`prisma://\``, e);
      }
      let { protocol: o, searchParams: s } = i;
      if (o !== "prisma:" && o !== fr) throw new Ue(`Error validating datasource \`${r}\`: the URL must start with the protocol \`prisma://\` or \`prisma+postgres://\``, e);
      let a = s.get("api_key");
      if (a === null || a.length < 1) throw new Ue(`Error validating datasource \`${r}\`: the URL must contain a valid API key`, e);
      let f = cn(i) ? "http:" : "https:";
      g.env.TEST_CLIENT_ENGINE_REMOTE_EXECUTOR && i.searchParams.has("use_http") && (f = "http:");
      let v = new URL(i.href.replace(o, f));
      return { apiKey: a, url: v };
    }
    __name(zo, "zo");
    u();
    c();
    p();
    m();
    d();
    l();
    var Yo = bt(Di());
    var $r = class {
      static {
        __name(this, "$r");
      }
      apiKey;
      tracingHelper;
      logLevel;
      logQueries;
      engineHash;
      constructor({ apiKey: e, tracingHelper: r, logLevel: n, logQueries: i, engineHash: o }) {
        this.apiKey = e, this.tracingHelper = r, this.logLevel = n, this.logQueries = i, this.engineHash = o;
      }
      build({ traceparent: e, transactionId: r } = {}) {
        let n = { Accept: "application/json", Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Prisma-Engine-Hash": this.engineHash, "Prisma-Engine-Version": Yo.enginesVersion };
        this.tracingHelper.isEnabled() && (n.traceparent = e ?? this.tracingHelper.getTraceParent()), r && (n["X-Transaction-Id"] = r);
        let i = this.#e();
        return i.length > 0 && (n["X-Capture-Telemetry"] = i.join(", ")), n;
      }
      #e() {
        let e = [];
        return this.tracingHelper.isEnabled() && e.push("tracing"), this.logLevel && e.push(this.logLevel), this.logQueries && e.push("query"), e;
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function hu(t) {
      return t[0] * 1e3 + t[1] / 1e6;
    }
    __name(hu, "hu");
    function _n(t) {
      return new Date(hu(t));
    }
    __name(_n, "_n");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var pt = class extends ie {
      static {
        __name(this, "pt");
      }
      name = "ForcedRetryError";
      code = "P5001";
      constructor(e) {
        super("This request must be retried", _(e, true));
      }
    };
    O(pt, "ForcedRetryError");
    u();
    c();
    p();
    m();
    d();
    l();
    var qe = class extends ie {
      static {
        __name(this, "qe");
      }
      name = "NotImplementedYetError";
      code = "P5004";
      constructor(e, r) {
        super(e, _(r, false));
      }
    };
    O(qe, "NotImplementedYetError");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var V = class extends ie {
      static {
        __name(this, "V");
      }
      response;
      constructor(e, r) {
        super(e, r), this.response = r.response;
        let n = this.response.headers.get("prisma-request-id");
        if (n) {
          let i = `(The request id was: ${n})`;
          this.message = this.message + " " + i;
        }
      }
    };
    var Ve = class extends V {
      static {
        __name(this, "Ve");
      }
      name = "SchemaMissingError";
      code = "P5005";
      constructor(e) {
        super("Schema needs to be uploaded", _(e, true));
      }
    };
    O(Ve, "SchemaMissingError");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Mn = "This request could not be understood by the server";
    var Vt = class extends V {
      static {
        __name(this, "Vt");
      }
      name = "BadRequestError";
      code = "P5000";
      constructor(e, r, n) {
        super(r || Mn, _(e, false)), n && (this.code = n);
      }
    };
    O(Vt, "BadRequestError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Bt = class extends V {
      static {
        __name(this, "Bt");
      }
      name = "HealthcheckTimeoutError";
      code = "P5013";
      logs;
      constructor(e, r) {
        super("Engine not started: healthcheck timeout", _(e, true)), this.logs = r;
      }
    };
    O(Bt, "HealthcheckTimeoutError");
    u();
    c();
    p();
    m();
    d();
    l();
    var $t = class extends V {
      static {
        __name(this, "$t");
      }
      name = "EngineStartupError";
      code = "P5014";
      logs;
      constructor(e, r, n) {
        super(r, _(e, true)), this.logs = n;
      }
    };
    O($t, "EngineStartupError");
    u();
    c();
    p();
    m();
    d();
    l();
    var jt = class extends V {
      static {
        __name(this, "jt");
      }
      name = "EngineVersionNotSupportedError";
      code = "P5012";
      constructor(e) {
        super("Engine version is not supported", _(e, false));
      }
    };
    O(jt, "EngineVersionNotSupportedError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Ln = "Request timed out";
    var Qt = class extends V {
      static {
        __name(this, "Qt");
      }
      name = "GatewayTimeoutError";
      code = "P5009";
      constructor(e, r = Ln) {
        super(r, _(e, false));
      }
    };
    O(Qt, "GatewayTimeoutError");
    u();
    c();
    p();
    m();
    d();
    l();
    var bu = "Interactive transaction error";
    var Gt = class extends V {
      static {
        __name(this, "Gt");
      }
      name = "InteractiveTransactionError";
      code = "P5015";
      constructor(e, r = bu) {
        super(r, _(e, false));
      }
    };
    O(Gt, "InteractiveTransactionError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Eu = "Request parameters are invalid";
    var Jt = class extends V {
      static {
        __name(this, "Jt");
      }
      name = "InvalidRequestError";
      code = "P5011";
      constructor(e, r = Eu) {
        super(r, _(e, false));
      }
    };
    O(Jt, "InvalidRequestError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Fn = "Requested resource does not exist";
    var Wt = class extends V {
      static {
        __name(this, "Wt");
      }
      name = "NotFoundError";
      code = "P5003";
      constructor(e, r = Fn) {
        super(r, _(e, false));
      }
    };
    O(Wt, "NotFoundError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Nn = "Unknown server error";
    var mt = class extends V {
      static {
        __name(this, "mt");
      }
      name = "ServerError";
      code = "P5006";
      logs;
      constructor(e, r, n) {
        super(r || Nn, _(e, true)), this.logs = n;
      }
    };
    O(mt, "ServerError");
    u();
    c();
    p();
    m();
    d();
    l();
    var Un = "Unauthorized, check your connection string";
    var Kt = class extends V {
      static {
        __name(this, "Kt");
      }
      name = "UnauthorizedError";
      code = "P5007";
      constructor(e, r = Un) {
        super(r, _(e, false));
      }
    };
    O(Kt, "UnauthorizedError");
    u();
    c();
    p();
    m();
    d();
    l();
    var qn = "Usage exceeded, retry again later";
    var Ht = class extends V {
      static {
        __name(this, "Ht");
      }
      name = "UsageExceededError";
      code = "P5008";
      constructor(e, r = qn) {
        super(r, _(e, true));
      }
    };
    O(Ht, "UsageExceededError");
    async function wu(t) {
      let e;
      try {
        e = await t.text();
      } catch {
        return { type: "EmptyError" };
      }
      try {
        let r = JSON.parse(e);
        if (typeof r == "string") switch (r) {
          case "InternalDataProxyError":
            return { type: "DataProxyError", body: r };
          default:
            return { type: "UnknownTextError", body: r };
        }
        if (typeof r == "object" && r !== null) {
          if ("is_panic" in r && "message" in r && "error_code" in r) return { type: "QueryEngineError", body: r };
          if ("EngineNotStarted" in r || "InteractiveTransactionMisrouted" in r || "InvalidRequestError" in r) {
            let n = Object.values(r)[0].reason;
            return typeof n == "string" && !["SchemaMissing", "EngineVersionNotSupported"].includes(n) ? { type: "UnknownJsonError", body: r } : { type: "DataProxyError", body: r };
          }
        }
        return { type: "UnknownJsonError", body: r };
      } catch {
        return e === "" ? { type: "EmptyError" } : { type: "UnknownTextError", body: e };
      }
    }
    __name(wu, "wu");
    async function zt(t, e) {
      if (t.ok) return;
      let r = { clientVersion: e, response: t }, n = await wu(t);
      if (n.type === "QueryEngineError") throw new X(n.body.message, { code: n.body.error_code, clientVersion: e });
      if (n.type === "DataProxyError") {
        if (n.body === "InternalDataProxyError") throw new mt(r, "Internal Data Proxy error");
        if ("EngineNotStarted" in n.body) {
          if (n.body.EngineNotStarted.reason === "SchemaMissing") return new Ve(r);
          if (n.body.EngineNotStarted.reason === "EngineVersionNotSupported") throw new jt(r);
          if ("EngineStartupError" in n.body.EngineNotStarted.reason) {
            let { msg: i, logs: o } = n.body.EngineNotStarted.reason.EngineStartupError;
            throw new $t(r, i, o);
          }
          if ("KnownEngineStartupError" in n.body.EngineNotStarted.reason) {
            let { msg: i, error_code: o } = n.body.EngineNotStarted.reason.KnownEngineStartupError;
            throw new M(i, e, o);
          }
          if ("HealthcheckTimeout" in n.body.EngineNotStarted.reason) {
            let { logs: i } = n.body.EngineNotStarted.reason.HealthcheckTimeout;
            throw new Bt(r, i);
          }
        }
        if ("InteractiveTransactionMisrouted" in n.body) {
          let i = { IDParseError: "Could not parse interactive transaction ID", NoQueryEngineFoundError: "Could not find Query Engine for the specified host and transaction ID", TransactionStartError: "Could not start interactive transaction" };
          throw new Gt(r, i[n.body.InteractiveTransactionMisrouted.reason]);
        }
        if ("InvalidRequestError" in n.body) throw new Jt(r, n.body.InvalidRequestError.reason);
      }
      if (t.status === 401 || t.status === 403) throw new Kt(r, dt(Un, n));
      if (t.status === 404) return new Wt(r, dt(Fn, n));
      if (t.status === 429) throw new Ht(r, dt(qn, n));
      if (t.status === 504) throw new Qt(r, dt(Ln, n));
      if (t.status >= 500) throw new mt(r, dt(Nn, n));
      if (t.status >= 400) throw new Vt(r, dt(Mn, n));
    }
    __name(zt, "zt");
    function dt(t, e) {
      return e.type === "EmptyError" ? t : `${t}: ${JSON.stringify(e)}`;
    }
    __name(dt, "dt");
    u();
    c();
    p();
    m();
    d();
    l();
    function Xo(t) {
      let e = Math.pow(2, t) * 50, r = Math.ceil(Math.random() * e) - Math.ceil(e / 2), n = e + r;
      return new Promise((i) => setTimeout(() => i(n), n));
    }
    __name(Xo, "Xo");
    u();
    c();
    p();
    m();
    d();
    l();
    var Re = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function Zo(t) {
      let e = new TextEncoder().encode(t), r = "", n = e.byteLength, i = n % 3, o = n - i, s, a, f, v, R;
      for (let A = 0; A < o; A = A + 3) R = e[A] << 16 | e[A + 1] << 8 | e[A + 2], s = (R & 16515072) >> 18, a = (R & 258048) >> 12, f = (R & 4032) >> 6, v = R & 63, r += Re[s] + Re[a] + Re[f] + Re[v];
      return i == 1 ? (R = e[o], s = (R & 252) >> 2, a = (R & 3) << 4, r += Re[s] + Re[a] + "==") : i == 2 && (R = e[o] << 8 | e[o + 1], s = (R & 64512) >> 10, a = (R & 1008) >> 4, f = (R & 15) << 2, r += Re[s] + Re[a] + Re[f] + "="), r;
    }
    __name(Zo, "Zo");
    u();
    c();
    p();
    m();
    d();
    l();
    function es(t) {
      if (!!t.generator?.previewFeatures.some((r) => r.toLowerCase().includes("metrics"))) throw new M("The `metrics` preview feature is not yet available with Accelerate.\nPlease remove `metrics` from the `previewFeatures` in your schema.\n\nMore information about Accelerate: https://pris.ly/d/accelerate", t.clientVersion);
    }
    __name(es, "es");
    u();
    c();
    p();
    m();
    d();
    l();
    var ts = { "@prisma/debug": "workspace:*", "@prisma/engines-version": "7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7", "@prisma/fetch-engine": "workspace:*", "@prisma/get-platform": "workspace:*" };
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var Yt = class extends ie {
      static {
        __name(this, "Yt");
      }
      name = "RequestError";
      code = "P5010";
      constructor(e, r) {
        super(`Cannot fetch data from service:
${e}`, _(r, true));
      }
    };
    O(Yt, "RequestError");
    async function Be(t, e, r = (n) => n) {
      let { clientVersion: n, ...i } = e, o = r(fetch);
      try {
        return await o(t, i);
      } catch (s) {
        let a = s.message ?? "Unknown error";
        throw new Yt(a, { clientVersion: n, cause: s });
      }
    }
    __name(Be, "Be");
    var Pu = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/;
    var rs = j("prisma:client:dataproxyEngine");
    async function Tu(t, e) {
      let r = ts["@prisma/engines-version"], n = e.clientVersion ?? "unknown";
      if (g.env.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION || globalThis.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION) return g.env.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION || globalThis.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION;
      if (t.includes("accelerate") && n !== "0.0.0" && n !== "in-memory") return n;
      let [i, o] = n?.split("-") ?? [];
      if (o === void 0 && Pu.test(i)) return i;
      if (o !== void 0 || n === "0.0.0" || n === "in-memory") {
        let [s] = r.split("-") ?? [], [a, f, v] = s.split("."), R = vu(`<=${a}.${f}.${v}`), A = await Be(R, { clientVersion: n });
        if (!A.ok) throw new Error(`Failed to fetch stable Prisma version, unpkg.com status ${A.status} ${A.statusText}, response body: ${await A.text() || "<empty body>"}`);
        let I = await A.text();
        rs("length of body fetched from unpkg.com", I.length);
        let C;
        try {
          C = JSON.parse(I);
        } catch (L) {
          throw console.error("JSON.parse error: body fetched from unpkg.com: ", I), L;
        }
        return C.version;
      }
      throw new qe("Only `major.minor.patch` versions are supported by Accelerate.", { clientVersion: n });
    }
    __name(Tu, "Tu");
    async function ns(t, e) {
      let r = await Tu(t, e);
      return rs("version", r), r;
    }
    __name(ns, "ns");
    function vu(t) {
      return encodeURI(`https://unpkg.com/prisma@${t}/package.json`);
    }
    __name(vu, "vu");
    var is = 3;
    var Xt = j("prisma:client:dataproxyEngine");
    var Zt = class {
      static {
        __name(this, "Zt");
      }
      name = "DataProxyEngine";
      inlineSchema;
      inlineSchemaHash;
      inlineDatasources;
      config;
      logEmitter;
      env;
      clientVersion;
      engineHash;
      tracingHelper;
      remoteClientVersion;
      host;
      headerBuilder;
      startPromise;
      protocol;
      constructor(e) {
        es(e), this.config = e, this.env = e.env, this.inlineSchema = Zo(e.inlineSchema), this.inlineDatasources = e.inlineDatasources, this.inlineSchemaHash = e.inlineSchemaHash, this.clientVersion = e.clientVersion, this.engineHash = e.engineVersion, this.logEmitter = e.logEmitter, this.tracingHelper = e.tracingHelper;
      }
      apiKey() {
        return this.headerBuilder.apiKey;
      }
      version() {
        return this.engineHash;
      }
      async start() {
        this.startPromise !== void 0 && await this.startPromise, this.startPromise = (async () => {
          let { apiKey: e, url: r } = this.getURLAndAPIKey();
          this.host = r.host, this.protocol = r.protocol, this.headerBuilder = new $r({ apiKey: e, tracingHelper: this.tracingHelper, logLevel: this.config.logLevel ?? "error", logQueries: this.config.logQueries, engineHash: this.engineHash }), this.remoteClientVersion = await ns(this.host, this.config), Xt("host", this.host), Xt("protocol", this.protocol);
        })(), await this.startPromise;
      }
      async stop() {
      }
      propagateResponseExtensions(e) {
        e?.logs?.length && e.logs.forEach((r) => {
          switch (r.level) {
            case "debug":
            case "trace":
              Xt(r);
              break;
            case "error":
            case "warn":
            case "info": {
              this.logEmitter.emit(r.level, { timestamp: _n(r.timestamp), message: r.attributes.message ?? "", target: r.target ?? "BinaryEngine" });
              break;
            }
            case "query": {
              this.logEmitter.emit("query", { query: r.attributes.query ?? "", timestamp: _n(r.timestamp), duration: r.attributes.duration_ms ?? 0, params: r.attributes.params ?? "", target: r.target ?? "BinaryEngine" });
              break;
            }
            default:
              r.level;
          }
        }), e?.traces?.length && this.tracingHelper.dispatchEngineSpans(e.traces);
      }
      onBeforeExit() {
        throw new Error('"beforeExit" hook is not applicable to the remote query engine');
      }
      async url(e) {
        return await this.start(), `${this.protocol}//${this.host}/${this.remoteClientVersion}/${this.inlineSchemaHash}/${e}`;
      }
      async uploadSchema() {
        let e = { name: "schemaUpload", internal: true };
        return this.tracingHelper.runInChildSpan(e, async () => {
          let r = await Be(await this.url("schema"), { method: "PUT", headers: this.headerBuilder.build(), body: this.inlineSchema, clientVersion: this.clientVersion });
          r.ok || Xt("schema response status", r.status);
          let n = await zt(r, this.clientVersion);
          if (n) throw this.logEmitter.emit("warn", { message: `Error while uploading schema: ${n.message}`, timestamp: /* @__PURE__ */ new Date(), target: "" }), n;
          this.logEmitter.emit("info", { message: `Schema (re)uploaded (hash: ${this.inlineSchemaHash})`, timestamp: /* @__PURE__ */ new Date(), target: "" });
        });
      }
      request(e, { traceparent: r, interactiveTransaction: n, customDataProxyFetch: i }) {
        return this.requestInternal({ body: e, traceparent: r, interactiveTransaction: n, customDataProxyFetch: i });
      }
      async requestBatch(e, { traceparent: r, transaction: n, customDataProxyFetch: i }) {
        let o = n?.kind === "itx" ? n.options : void 0, s = ot(e, n);
        return (await this.requestInternal({ body: s, customDataProxyFetch: i, interactiveTransaction: o, traceparent: r })).map((f) => (f.extensions && this.propagateResponseExtensions(f.extensions), "errors" in f ? this.convertProtocolErrorsToClientError(f.errors) : f));
      }
      requestInternal({ body: e, traceparent: r, customDataProxyFetch: n, interactiveTransaction: i }) {
        return this.withRetry({ actionGerund: "querying", callback: /* @__PURE__ */ __name(async ({ logHttpCall: o }) => {
          let s = i ? `${i.payload.endpoint}/graphql` : await this.url("graphql");
          o(s);
          let a = await Be(s, { method: "POST", headers: this.headerBuilder.build({ traceparent: r, transactionId: i?.id }), body: JSON.stringify(e), clientVersion: this.clientVersion }, n);
          a.ok || Xt("graphql response status", a.status), await this.handleError(await zt(a, this.clientVersion));
          let f = await a.json();
          if (f.extensions && this.propagateResponseExtensions(f.extensions), "errors" in f) throw this.convertProtocolErrorsToClientError(f.errors);
          return "batchResult" in f ? f.batchResult : f;
        }, "callback") });
      }
      async transaction(e, r, n) {
        let i = { start: "starting", commit: "committing", rollback: "rolling back" };
        return this.withRetry({ actionGerund: `${i[e]} transaction`, callback: /* @__PURE__ */ __name(async ({ logHttpCall: o }) => {
          if (e === "start") {
            let s = JSON.stringify({ max_wait: n.maxWait, timeout: n.timeout, isolation_level: n.isolationLevel }), a = await this.url("transaction/start");
            o(a);
            let f = await Be(a, { method: "POST", headers: this.headerBuilder.build({ traceparent: r.traceparent }), body: s, clientVersion: this.clientVersion });
            await this.handleError(await zt(f, this.clientVersion));
            let v = await f.json(), { extensions: R } = v;
            R && this.propagateResponseExtensions(R);
            let A = v.id, I = v["data-proxy"].endpoint;
            return { id: A, payload: { endpoint: I } };
          } else {
            let s = `${n.payload.endpoint}/${e}`;
            o(s);
            let a = await Be(s, { method: "POST", headers: this.headerBuilder.build({ traceparent: r.traceparent }), clientVersion: this.clientVersion });
            await this.handleError(await zt(a, this.clientVersion));
            let f = await a.json(), { extensions: v } = f;
            v && this.propagateResponseExtensions(v);
            return;
          }
        }, "callback") });
      }
      getURLAndAPIKey() {
        return zo({ clientVersion: this.clientVersion, env: this.env, inlineDatasources: this.inlineDatasources, overrideDatasources: this.config.overrideDatasources });
      }
      metrics() {
        throw new qe("Metrics are not yet supported for Accelerate", { clientVersion: this.clientVersion });
      }
      async withRetry(e) {
        for (let r = 0; ; r++) {
          let n = /* @__PURE__ */ __name((i) => {
            this.logEmitter.emit("info", { message: `Calling ${i} (n=${r})`, timestamp: /* @__PURE__ */ new Date(), target: "" });
          }, "n");
          try {
            return await e.callback({ logHttpCall: n });
          } catch (i) {
            if (!(i instanceof ie) || !i.isRetryable) throw i;
            if (r >= is) throw i instanceof pt ? i.cause : i;
            this.logEmitter.emit("warn", { message: `Attempt ${r + 1}/${is} failed for ${e.actionGerund}: ${i.message ?? "(unknown)"}`, timestamp: /* @__PURE__ */ new Date(), target: "" });
            let o = await Xo(r);
            this.logEmitter.emit("warn", { message: `Retrying after ${o}ms`, timestamp: /* @__PURE__ */ new Date(), target: "" });
          }
        }
      }
      async handleError(e) {
        if (e instanceof Ve) throw await this.uploadSchema(), new pt({ clientVersion: this.clientVersion, cause: e });
        if (e) throw e;
      }
      convertProtocolErrorsToClientError(e) {
        return e.length === 1 ? st(e[0], this.config.clientVersion, this.config.activeProvider) : new Q(JSON.stringify(e), { clientVersion: this.config.clientVersion });
      }
      applyPendingMigrations() {
        throw new Error("Method not implemented.");
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function os(t) {
      if (t?.kind === "itx") return t.options.id;
    }
    __name(os, "os");
    u();
    c();
    p();
    m();
    d();
    l();
    var Vn;
    var ss = { async loadLibrary(t) {
      let { clientVersion: e, adapter: r, engineWasm: n } = t;
      if (r === void 0) throw new M(`The \`adapter\` option for \`PrismaClient\` is required in this context (${ut().prettyName})`, e);
      if (n === void 0) throw new M("WASM engine was unexpectedly `undefined`", e);
      Vn === void 0 && (Vn = (async () => {
        let o = await n.getRuntime(), s = await n.getQueryEngineWasmModule();
        if (s == null) throw new M("The loaded wasm module was unexpectedly `undefined` or `null` once loaded", e);
        let a = { "./query_engine_bg.js": o }, f = new WebAssembly.Instance(s, a), v = f.exports.__wbindgen_start;
        return o.__wbg_set_wasm(f.exports), v(), o.QueryEngine;
      })());
      let i = await Vn;
      return { debugPanic() {
        return Promise.reject("{}");
      }, dmmf() {
        return Promise.resolve("{}");
      }, version() {
        return { commit: "unknown", version: "unknown" };
      }, QueryEngine: i };
    } };
    var Ru = "P2036";
    var be = j("prisma:client:libraryEngine");
    function Au(t) {
      return t.item_type === "query" && "query" in t;
    }
    __name(Au, "Au");
    function Cu(t) {
      return "level" in t ? t.level === "error" && t.message === "PANIC" : false;
    }
    __name(Cu, "Cu");
    var VL = [...on, "native"];
    var Su = 0xffffffffffffffffn;
    var Bn = 1n;
    function Iu() {
      let t = Bn++;
      return Bn > Su && (Bn = 1n), t;
    }
    __name(Iu, "Iu");
    var er = class {
      static {
        __name(this, "er");
      }
      name = "LibraryEngine";
      engine;
      libraryInstantiationPromise;
      libraryStartingPromise;
      libraryStoppingPromise;
      libraryStarted;
      executingQueryPromise;
      config;
      QueryEngineConstructor;
      libraryLoader;
      library;
      logEmitter;
      libQueryEnginePath;
      binaryTarget;
      datasourceOverrides;
      datamodel;
      logQueries;
      logLevel;
      lastQuery;
      loggerRustPanic;
      tracingHelper;
      adapterPromise;
      versionInfo;
      constructor(e, r) {
        this.libraryLoader = r ?? ss, this.config = e, this.libraryStarted = false, this.logQueries = e.logQueries ?? false, this.logLevel = e.logLevel ?? "error", this.logEmitter = e.logEmitter, this.datamodel = e.inlineSchema, this.tracingHelper = e.tracingHelper, e.enableDebugLogs && (this.logLevel = "debug");
        let n = Object.keys(e.overrideDatasources)[0], i = e.overrideDatasources[n]?.url;
        n !== void 0 && i !== void 0 && (this.datasourceOverrides = { [n]: i }), this.libraryInstantiationPromise = this.instantiateLibrary();
      }
      wrapEngine(e) {
        return { applyPendingMigrations: e.applyPendingMigrations?.bind(e), commitTransaction: this.withRequestId(e.commitTransaction.bind(e)), connect: this.withRequestId(e.connect.bind(e)), disconnect: this.withRequestId(e.disconnect.bind(e)), metrics: e.metrics?.bind(e), query: this.withRequestId(e.query.bind(e)), rollbackTransaction: this.withRequestId(e.rollbackTransaction.bind(e)), sdlSchema: e.sdlSchema?.bind(e), startTransaction: this.withRequestId(e.startTransaction.bind(e)), trace: e.trace.bind(e), free: e.free?.bind(e) };
      }
      withRequestId(e) {
        return async (...r) => {
          let n = Iu().toString();
          try {
            return await e(...r, n);
          } finally {
            if (this.tracingHelper.isEnabled()) {
              let i = await this.engine?.trace(n);
              if (i) {
                let o = JSON.parse(i);
                this.tracingHelper.dispatchEngineSpans(o.spans);
              }
            }
          }
        };
      }
      async applyPendingMigrations() {
        throw new Error("Cannot call this method from this type of engine instance");
      }
      async transaction(e, r, n) {
        await this.start();
        let i = await this.adapterPromise, o = JSON.stringify(r), s;
        if (e === "start") {
          let f = JSON.stringify({ max_wait: n.maxWait, timeout: n.timeout, isolation_level: n.isolationLevel });
          s = await this.engine?.startTransaction(f, o);
        } else e === "commit" ? s = await this.engine?.commitTransaction(n.id, o) : e === "rollback" && (s = await this.engine?.rollbackTransaction(n.id, o));
        let a = this.parseEngineResponse(s);
        if (Du(a)) {
          let f = this.getExternalAdapterError(a, i?.errorRegistry);
          throw f ? f.error : new X(a.message, { code: a.error_code, clientVersion: this.config.clientVersion, meta: a.meta });
        } else if (typeof a.message == "string") throw new Q(a.message, { clientVersion: this.config.clientVersion });
        return a;
      }
      async instantiateLibrary() {
        if (be("internalSetup"), this.libraryInstantiationPromise) return this.libraryInstantiationPromise;
        this.binaryTarget = await this.getCurrentBinaryTarget(), await this.tracingHelper.runInChildSpan("load_engine", () => this.loadEngine()), this.version();
      }
      async getCurrentBinaryTarget() {
      }
      parseEngineResponse(e) {
        if (!e) throw new Q("Response from the Engine was empty", { clientVersion: this.config.clientVersion });
        try {
          return JSON.parse(e);
        } catch {
          throw new Q("Unable to JSON.parse response from engine", { clientVersion: this.config.clientVersion });
        }
      }
      async loadEngine() {
        if (!this.engine) {
          this.QueryEngineConstructor || (this.library = await this.libraryLoader.loadLibrary(this.config), this.QueryEngineConstructor = this.library.QueryEngine);
          try {
            let e = new b(this);
            this.adapterPromise || (this.adapterPromise = this.config.adapter?.connect()?.then(mr));
            let r = await this.adapterPromise;
            r && be("Using driver adapter: %O", r), this.engine = this.wrapEngine(new this.QueryEngineConstructor({ datamodel: this.datamodel, env: g.env, logQueries: this.config.logQueries ?? false, ignoreEnvVarErrors: true, datasourceOverrides: this.datasourceOverrides ?? {}, logLevel: this.logLevel, configDir: this.config.cwd, engineProtocol: "json", enableTracing: this.tracingHelper.isEnabled() }, (n) => {
              e.deref()?.logger(n);
            }, r));
          } catch (e) {
            let r = e, n = this.parseInitError(r.message);
            throw typeof n == "string" ? r : new M(n.message, this.config.clientVersion, n.error_code);
          }
        }
      }
      logger(e) {
        let r = this.parseEngineResponse(e);
        r && (r.level = r?.level.toLowerCase() ?? "unknown", Au(r) ? this.logEmitter.emit("query", { timestamp: /* @__PURE__ */ new Date(), query: r.query, params: r.params, duration: Number(r.duration_ms), target: r.module_path }) : (Cu(r), this.logEmitter.emit(r.level, { timestamp: /* @__PURE__ */ new Date(), message: r.message, target: r.module_path })));
      }
      parseInitError(e) {
        try {
          return JSON.parse(e);
        } catch {
        }
        return e;
      }
      parseRequestError(e) {
        try {
          return JSON.parse(e);
        } catch {
        }
        return e;
      }
      onBeforeExit() {
        throw new Error('"beforeExit" hook is not applicable to the library engine since Prisma 5.0.0, it is only relevant and implemented for the binary engine. Please add your event listener to the `process` object directly instead.');
      }
      async start() {
        if (this.libraryInstantiationPromise || (this.libraryInstantiationPromise = this.instantiateLibrary()), await this.libraryInstantiationPromise, await this.libraryStoppingPromise, this.libraryStartingPromise) return be(`library already starting, this.libraryStarted: ${this.libraryStarted}`), this.libraryStartingPromise;
        if (this.libraryStarted) return;
        let e = /* @__PURE__ */ __name(async () => {
          be("library starting");
          try {
            let r = { traceparent: this.tracingHelper.getTraceParent() };
            await this.engine?.connect(JSON.stringify(r)), this.libraryStarted = true, this.adapterPromise || (this.adapterPromise = this.config.adapter?.connect()?.then(mr)), await this.adapterPromise, be("library started");
          } catch (r) {
            let n = this.parseInitError(r.message);
            throw typeof n == "string" ? r : new M(n.message, this.config.clientVersion, n.error_code);
          } finally {
            this.libraryStartingPromise = void 0;
          }
        }, "e");
        return this.libraryStartingPromise = this.tracingHelper.runInChildSpan("connect", e), this.libraryStartingPromise;
      }
      async stop() {
        if (await this.libraryInstantiationPromise, await this.libraryStartingPromise, await this.executingQueryPromise, this.libraryStoppingPromise) return be("library is already stopping"), this.libraryStoppingPromise;
        if (!this.libraryStarted) {
          await (await this.adapterPromise)?.dispose(), this.adapterPromise = void 0;
          return;
        }
        let e = /* @__PURE__ */ __name(async () => {
          await new Promise((n) => setImmediate(n)), be("library stopping");
          let r = { traceparent: this.tracingHelper.getTraceParent() };
          await this.engine?.disconnect(JSON.stringify(r)), this.engine?.free && this.engine.free(), this.engine = void 0, this.libraryStarted = false, this.libraryStoppingPromise = void 0, this.libraryInstantiationPromise = void 0, await (await this.adapterPromise)?.dispose(), this.adapterPromise = void 0, be("library stopped");
        }, "e");
        return this.libraryStoppingPromise = this.tracingHelper.runInChildSpan("disconnect", e), this.libraryStoppingPromise;
      }
      version() {
        return this.versionInfo = this.library?.version(), this.versionInfo?.version ?? "unknown";
      }
      debugPanic(e) {
        return this.library?.debugPanic(e);
      }
      async request(e, { traceparent: r, interactiveTransaction: n }) {
        be(`sending request, this.libraryStarted: ${this.libraryStarted}`);
        let i = JSON.stringify({ traceparent: r }), o = JSON.stringify(e);
        try {
          await this.start();
          let s = await this.adapterPromise;
          this.executingQueryPromise = this.engine?.query(o, i, n?.id), this.lastQuery = o;
          let a = this.parseEngineResponse(await this.executingQueryPromise);
          if (a.errors) throw a.errors.length === 1 ? this.buildQueryError(a.errors[0], s?.errorRegistry) : new Q(JSON.stringify(a.errors), { clientVersion: this.config.clientVersion });
          if (this.loggerRustPanic) throw this.loggerRustPanic;
          return { data: a };
        } catch (s) {
          if (s instanceof M) throw s;
          s.code === "GenericFailure" && s.message?.startsWith("PANIC:");
          let a = this.parseRequestError(s.message);
          throw typeof a == "string" ? s : new Q(`${a.message}
${a.backtrace}`, { clientVersion: this.config.clientVersion });
        }
      }
      async requestBatch(e, { transaction: r, traceparent: n }) {
        be("requestBatch");
        let i = ot(e, r);
        await this.start();
        let o = await this.adapterPromise;
        this.lastQuery = JSON.stringify(i), this.executingQueryPromise = this.engine?.query(this.lastQuery, JSON.stringify({ traceparent: n }), os(r));
        let s = await this.executingQueryPromise, a = this.parseEngineResponse(s);
        if (a.errors) throw a.errors.length === 1 ? this.buildQueryError(a.errors[0], o?.errorRegistry) : new Q(JSON.stringify(a.errors), { clientVersion: this.config.clientVersion });
        let { batchResult: f, errors: v } = a;
        if (Array.isArray(f)) return f.map((R) => R.errors && R.errors.length > 0 ? this.loggerRustPanic ?? this.buildQueryError(R.errors[0], o?.errorRegistry) : { data: R });
        throw v && v.length === 1 ? new Error(v[0].error) : new Error(JSON.stringify(a));
      }
      buildQueryError(e, r) {
        e.user_facing_error.is_panic;
        let n = this.getExternalAdapterError(e.user_facing_error, r);
        return n ? n.error : st(e, this.config.clientVersion, this.config.activeProvider);
      }
      getExternalAdapterError(e, r) {
        if (e.error_code === Ru && r) {
          let n = e.meta?.id;
          yr(typeof n == "number", "Malformed external JS error received from the engine");
          let i = r.consumeError(n);
          return yr(i, "External error with reported id was not registered"), i;
        }
      }
      async metrics(e) {
        await this.start();
        let r = await this.engine.metrics(JSON.stringify(e));
        return e.format === "prometheus" ? r : this.parseEngineResponse(r);
      }
    };
    function Du(t) {
      return typeof t == "object" && t !== null && t.error_code !== void 0;
    }
    __name(Du, "Du");
    u();
    c();
    p();
    m();
    d();
    l();
    function as({ url: t, adapter: e, copyEngine: r, targetBuildType: n }) {
      let i = [], o = [], s = /* @__PURE__ */ __name((D) => {
        i.push({ _tag: "warning", value: D });
      }, "s"), a = /* @__PURE__ */ __name((D) => {
        let k = D.join(`
`);
        o.push({ _tag: "error", value: k });
      }, "a"), f = !!t?.startsWith("prisma://"), v = gr(t), R = !!e, A = f || v;
      !R && r && A && n !== "client" && n !== "wasm-compiler-edge" && s(["recommend--no-engine", "In production, we recommend using `prisma generate --no-engine` (See: `prisma generate --help`)"]);
      let I = A || !r;
      R && (I || n === "edge") && (n === "edge" ? a(["Prisma Client was configured to use the `adapter` option but it was imported via its `/edge` endpoint.", "Please either remove the `/edge` endpoint or remove the `adapter` from the Prisma Client constructor."]) : A ? a(["You've provided both a driver adapter and an Accelerate database URL. Driver adapters currently cannot connect to Accelerate.", "Please provide either a driver adapter with a direct database URL or an Accelerate URL and no driver adapter."]) : r || a(["Prisma Client was configured to use the `adapter` option but `prisma generate` was run with `--no-engine`.", "Please run `prisma generate` without `--no-engine` to be able to use Prisma Client with the adapter."]));
      let C = { accelerate: I, ppg: v, driverAdapters: R };
      function L(D) {
        return D.length > 0;
      }
      __name(L, "L");
      return L(o) ? { ok: false, diagnostics: { warnings: i, errors: o }, isUsing: C } : { ok: true, diagnostics: { warnings: i }, isUsing: C };
    }
    __name(as, "as");
    function ls({ copyEngine: t = true }, e) {
      let r;
      try {
        r = ct({ inlineDatasources: e.inlineDatasources, overrideDatasources: e.overrideDatasources, env: { ...e.env, ...g.env }, clientVersion: e.clientVersion });
      } catch {
      }
      let { ok: n, isUsing: i, diagnostics: o } = as({ url: r, adapter: e.adapter, copyEngine: t, targetBuildType: "wasm-engine-edge" });
      for (let A of o.warnings) Tt(...A.value);
      if (!n) {
        let A = o.errors[0];
        throw new Y(A.value, { clientVersion: e.clientVersion });
      }
      let s = Je(e.generator), a = s === "library", f = s === "binary", v = s === "client", R = (i.accelerate || i.ppg) && !i.driverAdapters;
      return i.accelerate ? new Zt(e) : i.driverAdapters ? new er(e) : new $n({ clientVersion: e.clientVersion });
    }
    __name(ls, "ls");
    var $n = class {
      static {
        __name(this, "$n");
      }
      constructor(e) {
        return new Proxy(this, { get(r, n) {
          let i = `In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters`;
          throw new Y(i, e);
        } });
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    function us({ generator: t }) {
      return t?.previewFeatures ?? [];
    }
    __name(us, "us");
    u();
    c();
    p();
    m();
    d();
    l();
    var cs = /* @__PURE__ */ __name((t) => ({ command: t }), "cs");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    var ps = /* @__PURE__ */ __name((t) => t.strings.reduce((e, r, n) => `${e}@P${n}${r}`), "ps");
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    function ft(t) {
      try {
        return ms(t, "fast");
      } catch {
        return ms(t, "slow");
      }
    }
    __name(ft, "ft");
    function ms(t, e) {
      return JSON.stringify(t.map((r) => fs(r, e)));
    }
    __name(ms, "ms");
    function fs(t, e) {
      if (Array.isArray(t)) return t.map((r) => fs(r, e));
      if (typeof t == "bigint") return { prisma__type: "bigint", prisma__value: t.toString() };
      if (We(t)) return { prisma__type: "date", prisma__value: t.toJSON() };
      if (xe.isDecimal(t)) return { prisma__type: "decimal", prisma__value: t.toJSON() };
      if (h.isBuffer(t)) return { prisma__type: "bytes", prisma__value: t.toString("base64") };
      if (Ou(t)) return { prisma__type: "bytes", prisma__value: h.from(t).toString("base64") };
      if (ArrayBuffer.isView(t)) {
        let { buffer: r, byteOffset: n, byteLength: i } = t;
        return { prisma__type: "bytes", prisma__value: h.from(r, n, i).toString("base64") };
      }
      return typeof t == "object" && e === "slow" ? gs(t) : t;
    }
    __name(fs, "fs");
    function Ou(t) {
      return t instanceof ArrayBuffer || t instanceof SharedArrayBuffer ? true : typeof t == "object" && t !== null ? t[Symbol.toStringTag] === "ArrayBuffer" || t[Symbol.toStringTag] === "SharedArrayBuffer" : false;
    }
    __name(Ou, "Ou");
    function gs(t) {
      if (typeof t != "object" || t === null) return t;
      if (typeof t.toJSON == "function") return t.toJSON();
      if (Array.isArray(t)) return t.map(ds);
      let e = {};
      for (let r of Object.keys(t)) e[r] = ds(t[r]);
      return e;
    }
    __name(gs, "gs");
    function ds(t) {
      return typeof t == "bigint" ? t.toString() : gs(t);
    }
    __name(ds, "ds");
    var ku = /^(\s*alter\s)/i;
    var ys = j("prisma:client");
    function jn(t, e, r, n) {
      if (!(t !== "postgresql" && t !== "cockroachdb") && r.length > 0 && ku.exec(e)) throw new Error(`Running ALTER using ${n} is not supported
Using the example below you can still execute your query with Prisma, but please note that it is vulnerable to SQL injection attacks and requires you to take care of input sanitization.

Example:
  await prisma.$executeRawUnsafe(\`ALTER USER prisma WITH PASSWORD '\${password}'\`)

More Information: https://pris.ly/d/execute-raw
`);
    }
    __name(jn, "jn");
    var Qn = /* @__PURE__ */ __name(({ clientMethod: t, activeProvider: e }) => (r) => {
      let n = "", i;
      if (Lr(r)) n = r.sql, i = { values: ft(r.values), __prismaRawParameters__: true };
      else if (Array.isArray(r)) {
        let [o, ...s] = r;
        n = o, i = { values: ft(s || []), __prismaRawParameters__: true };
      } else switch (e) {
        case "sqlite":
        case "mysql": {
          n = r.sql, i = { values: ft(r.values), __prismaRawParameters__: true };
          break;
        }
        case "cockroachdb":
        case "postgresql":
        case "postgres": {
          n = r.text, i = { values: ft(r.values), __prismaRawParameters__: true };
          break;
        }
        case "sqlserver": {
          n = ps(r), i = { values: ft(r.values), __prismaRawParameters__: true };
          break;
        }
        default:
          throw new Error(`The ${e} provider does not support ${t}`);
      }
      return i?.values ? ys(`prisma.${t}(${n}, ${i.values})`) : ys(`prisma.${t}(${n})`), { query: n, parameters: i };
    }, "Qn");
    var hs = { requestArgsToMiddlewareArgs(t) {
      return [t.strings, ...t.values];
    }, middlewareArgsToRequestArgs(t) {
      let [e, ...r] = t;
      return new ne(e, r);
    } };
    var bs = { requestArgsToMiddlewareArgs(t) {
      return [t];
    }, middlewareArgsToRequestArgs(t) {
      return t[0];
    } };
    u();
    c();
    p();
    m();
    d();
    l();
    function Gn(t) {
      return function(r, n) {
        let i, o = /* @__PURE__ */ __name((s = t) => {
          try {
            return s === void 0 || s?.kind === "itx" ? i ??= Es(r(s)) : Es(r(s));
          } catch (a) {
            return Promise.reject(a);
          }
        }, "o");
        return { get spec() {
          return n;
        }, then(s, a) {
          return o().then(s, a);
        }, catch(s) {
          return o().catch(s);
        }, finally(s) {
          return o().finally(s);
        }, requestTransaction(s) {
          let a = o(s);
          return a.requestTransaction ? a.requestTransaction(s) : a;
        }, [Symbol.toStringTag]: "PrismaPromise" };
      };
    }
    __name(Gn, "Gn");
    function Es(t) {
      return typeof t.then == "function" ? t : Promise.resolve(t);
    }
    __name(Es, "Es");
    u();
    c();
    p();
    m();
    d();
    l();
    var _u = sn.split(".")[0];
    var Mu = { isEnabled() {
      return false;
    }, getTraceParent() {
      return "00-10-10-00";
    }, dispatchEngineSpans() {
    }, getActiveContext() {
    }, runInChildSpan(t, e) {
      return e();
    } };
    var Jn = class {
      static {
        __name(this, "Jn");
      }
      isEnabled() {
        return this.getGlobalTracingHelper().isEnabled();
      }
      getTraceParent(e) {
        return this.getGlobalTracingHelper().getTraceParent(e);
      }
      dispatchEngineSpans(e) {
        return this.getGlobalTracingHelper().dispatchEngineSpans(e);
      }
      getActiveContext() {
        return this.getGlobalTracingHelper().getActiveContext();
      }
      runInChildSpan(e, r) {
        return this.getGlobalTracingHelper().runInChildSpan(e, r);
      }
      getGlobalTracingHelper() {
        let e = globalThis[`V${_u}_PRISMA_INSTRUMENTATION`], r = globalThis.PRISMA_INSTRUMENTATION;
        return e?.helper ?? r?.helper ?? Mu;
      }
    };
    function ws() {
      return new Jn();
    }
    __name(ws, "ws");
    u();
    c();
    p();
    m();
    d();
    l();
    function xs(t, e = () => {
    }) {
      let r, n = new Promise((i) => r = i);
      return { then(i) {
        return --t === 0 && r(e()), i?.(n);
      } };
    }
    __name(xs, "xs");
    u();
    c();
    p();
    m();
    d();
    l();
    function Ps(t) {
      return typeof t == "string" ? t : t.reduce((e, r) => {
        let n = typeof r == "string" ? r : r.level;
        return n === "query" ? e : e && (r === "info" || e === "info") ? "info" : n;
      }, void 0);
    }
    __name(Ps, "Ps");
    u();
    c();
    p();
    m();
    d();
    l();
    u();
    c();
    p();
    m();
    d();
    l();
    function jr(t) {
      return typeof t.batchRequestIdx == "number";
    }
    __name(jr, "jr");
    u();
    c();
    p();
    m();
    d();
    l();
    function Ts(t) {
      if (t.action !== "findUnique" && t.action !== "findUniqueOrThrow") return;
      let e = [];
      return t.modelName && e.push(t.modelName), t.query.arguments && e.push(Wn(t.query.arguments)), e.push(Wn(t.query.selection)), e.join("");
    }
    __name(Ts, "Ts");
    function Wn(t) {
      return `(${Object.keys(t).sort().map((r) => {
        let n = t[r];
        return typeof n == "object" && n !== null ? `(${r} ${Wn(n)})` : r;
      }).join(" ")})`;
    }
    __name(Wn, "Wn");
    u();
    c();
    p();
    m();
    d();
    l();
    var Lu = { aggregate: false, aggregateRaw: false, createMany: true, createManyAndReturn: true, createOne: true, deleteMany: true, deleteOne: true, executeRaw: true, findFirst: false, findFirstOrThrow: false, findMany: false, findRaw: false, findUnique: false, findUniqueOrThrow: false, groupBy: false, queryRaw: false, runCommandRaw: true, updateMany: true, updateManyAndReturn: true, updateOne: true, upsertOne: true };
    function Kn(t) {
      return Lu[t];
    }
    __name(Kn, "Kn");
    u();
    c();
    p();
    m();
    d();
    l();
    var Qr = class {
      static {
        __name(this, "Qr");
      }
      constructor(e) {
        this.options = e;
        this.batches = {};
      }
      batches;
      tickActive = false;
      request(e) {
        let r = this.options.batchBy(e);
        return r ? (this.batches[r] || (this.batches[r] = [], this.tickActive || (this.tickActive = true, g.nextTick(() => {
          this.dispatchBatches(), this.tickActive = false;
        }))), new Promise((n, i) => {
          this.batches[r].push({ request: e, resolve: n, reject: i });
        })) : this.options.singleLoader(e);
      }
      dispatchBatches() {
        for (let e in this.batches) {
          let r = this.batches[e];
          delete this.batches[e], r.length === 1 ? this.options.singleLoader(r[0].request).then((n) => {
            n instanceof Error ? r[0].reject(n) : r[0].resolve(n);
          }).catch((n) => {
            r[0].reject(n);
          }) : (r.sort((n, i) => this.options.batchOrder(n.request, i.request)), this.options.batchLoader(r.map((n) => n.request)).then((n) => {
            if (n instanceof Error) for (let i = 0; i < r.length; i++) r[i].reject(n);
            else for (let i = 0; i < r.length; i++) {
              let o = n[i];
              o instanceof Error ? r[i].reject(o) : r[i].resolve(o);
            }
          }).catch((n) => {
            for (let i = 0; i < r.length; i++) r[i].reject(n);
          }));
        }
      }
      get [Symbol.toStringTag]() {
        return "DataLoader";
      }
    };
    u();
    c();
    p();
    m();
    d();
    l();
    l();
    function $e(t, e) {
      if (e === null) return e;
      switch (t) {
        case "bigint":
          return BigInt(e);
        case "bytes": {
          let { buffer: r, byteOffset: n, byteLength: i } = h.from(e, "base64");
          return new Uint8Array(r, n, i);
        }
        case "decimal":
          return new xe(e);
        case "datetime":
        case "date":
          return new Date(e);
        case "time":
          return /* @__PURE__ */ new Date(`1970-01-01T${e}Z`);
        case "bigint-array":
          return e.map((r) => $e("bigint", r));
        case "bytes-array":
          return e.map((r) => $e("bytes", r));
        case "decimal-array":
          return e.map((r) => $e("decimal", r));
        case "datetime-array":
          return e.map((r) => $e("datetime", r));
        case "date-array":
          return e.map((r) => $e("date", r));
        case "time-array":
          return e.map((r) => $e("time", r));
        default:
          return e;
      }
    }
    __name($e, "$e");
    function Gr(t) {
      let e = [], r = Fu(t);
      for (let n = 0; n < t.rows.length; n++) {
        let i = t.rows[n], o = { ...r };
        for (let s = 0; s < i.length; s++) o[t.columns[s]] = $e(t.types[s], i[s]);
        e.push(o);
      }
      return e;
    }
    __name(Gr, "Gr");
    function Fu(t) {
      let e = {};
      for (let r = 0; r < t.columns.length; r++) e[t.columns[r]] = null;
      return e;
    }
    __name(Fu, "Fu");
    var Nu = j("prisma:client:request_handler");
    var Jr = class {
      static {
        __name(this, "Jr");
      }
      client;
      dataloader;
      logEmitter;
      constructor(e, r) {
        this.logEmitter = r, this.client = e, this.dataloader = new Qr({ batchLoader: Bo(async ({ requests: n, customDataProxyFetch: i }) => {
          let { transaction: o, otelParentCtx: s } = n[0], a = n.map((A) => A.protocolQuery), f = this.client._tracingHelper.getTraceParent(s), v = n.some((A) => Kn(A.protocolQuery.action));
          return (await this.client._engine.requestBatch(a, { traceparent: f, transaction: Uu(o), containsWrite: v, customDataProxyFetch: i })).map((A, I) => {
            if (A instanceof Error) return A;
            try {
              return this.mapQueryEngineResult(n[I], A);
            } catch (C) {
              return C;
            }
          });
        }), singleLoader: /* @__PURE__ */ __name(async (n) => {
          let i = n.transaction?.kind === "itx" ? vs(n.transaction) : void 0, o = await this.client._engine.request(n.protocolQuery, { traceparent: this.client._tracingHelper.getTraceParent(), interactiveTransaction: i, isWrite: Kn(n.protocolQuery.action), customDataProxyFetch: n.customDataProxyFetch });
          return this.mapQueryEngineResult(n, o);
        }, "singleLoader"), batchBy: /* @__PURE__ */ __name((n) => n.transaction?.id ? `transaction-${n.transaction.id}` : Ts(n.protocolQuery), "batchBy"), batchOrder(n, i) {
          return n.transaction?.kind === "batch" && i.transaction?.kind === "batch" ? n.transaction.index - i.transaction.index : 0;
        } });
      }
      async request(e) {
        try {
          return await this.dataloader.request(e);
        } catch (r) {
          let { clientMethod: n, callsite: i, transaction: o, args: s, modelName: a } = e;
          this.handleAndLogRequestError({ error: r, clientMethod: n, callsite: i, transaction: o, args: s, modelName: a, globalOmit: e.globalOmit });
        }
      }
      mapQueryEngineResult({ dataPath: e, unpacker: r }, n) {
        let i = n?.data, o = this.unpack(i, e, r);
        return g.env.PRISMA_CLIENT_GET_TIME ? { data: o } : o;
      }
      handleAndLogRequestError(e) {
        try {
          this.handleRequestError(e);
        } catch (r) {
          throw this.logEmitter && this.logEmitter.emit("error", { message: r.message, target: e.clientMethod, timestamp: /* @__PURE__ */ new Date() }), r;
        }
      }
      handleRequestError({ error: e, clientMethod: r, callsite: n, transaction: i, args: o, modelName: s, globalOmit: a }) {
        if (Nu(e), qu(e, i)) throw e;
        if (e instanceof X && Vu(e)) {
          let v = Rs(e.meta);
          Ir({ args: o, errors: [v], callsite: n, errorFormat: this.client._errorFormat, originalMethod: r, clientVersion: this.client._clientVersion, globalOmit: a });
        }
        let f = e.message;
        if (n && (f = Er({ callsite: n, originalMethod: r, isPanic: e.isPanic, showColors: this.client._errorFormat === "pretty", message: f })), f = this.sanitizeMessage(f), e.code) {
          let v = s ? { modelName: s, ...e.meta } : e.meta;
          throw new X(f, { code: e.code, clientVersion: this.client._clientVersion, meta: v, batchRequestIdx: e.batchRequestIdx });
        } else {
          if (e.isPanic) throw new Te(f, this.client._clientVersion);
          if (e instanceof Q) throw new Q(f, { clientVersion: this.client._clientVersion, batchRequestIdx: e.batchRequestIdx });
          if (e instanceof M) throw new M(f, this.client._clientVersion);
          if (e instanceof Te) throw new Te(f, this.client._clientVersion);
        }
        throw e.clientVersion = this.client._clientVersion, e;
      }
      sanitizeMessage(e) {
        return this.client._errorFormat && this.client._errorFormat !== "pretty" ? dn(e) : e;
      }
      unpack(e, r, n) {
        if (!e || (e.data && (e = e.data), !e)) return e;
        let i = Object.keys(e)[0], o = Object.values(e)[0], s = r.filter((v) => v !== "select" && v !== "include"), a = In(o, s), f = i === "queryRaw" ? Gr(a) : lt(a);
        return n ? n(f) : f;
      }
      get [Symbol.toStringTag]() {
        return "RequestHandler";
      }
    };
    function Uu(t) {
      if (t) {
        if (t.kind === "batch") return { kind: "batch", options: { isolationLevel: t.isolationLevel } };
        if (t.kind === "itx") return { kind: "itx", options: vs(t) };
        Fe(t, "Unknown transaction kind");
      }
    }
    __name(Uu, "Uu");
    function vs(t) {
      return { id: t.id, payload: t.payload };
    }
    __name(vs, "vs");
    function qu(t, e) {
      return jr(t) && e?.kind === "batch" && t.batchRequestIdx !== e.index;
    }
    __name(qu, "qu");
    function Vu(t) {
      return t.code === "P2009" || t.code === "P2012";
    }
    __name(Vu, "Vu");
    function Rs(t) {
      if (t.kind === "Union") return { kind: "Union", errors: t.errors.map(Rs) };
      if (Array.isArray(t.selectionPath)) {
        let [, ...e] = t.selectionPath;
        return { ...t, selectionPath: e };
      }
      return t;
    }
    __name(Rs, "Rs");
    u();
    c();
    p();
    m();
    d();
    l();
    var As = Ho;
    u();
    c();
    p();
    m();
    d();
    l();
    var Os = bt(hn());
    u();
    c();
    p();
    m();
    d();
    l();
    var F = class extends Error {
      static {
        __name(this, "F");
      }
      constructor(e) {
        super(e + `
Read more at https://pris.ly/d/client-constructor`), this.name = "PrismaClientConstructorValidationError";
      }
      get [Symbol.toStringTag]() {
        return "PrismaClientConstructorValidationError";
      }
    };
    O(F, "PrismaClientConstructorValidationError");
    var Cs = ["datasources", "datasourceUrl", "errorFormat", "adapter", "log", "transactionOptions", "omit", "__internal"];
    var Ss = ["pretty", "colorless", "minimal"];
    var Is = ["info", "query", "warn", "error"];
    var Bu = { datasources: /* @__PURE__ */ __name((t, { datasourceNames: e }) => {
      if (t) {
        if (typeof t != "object" || Array.isArray(t)) throw new F(`Invalid value ${JSON.stringify(t)} for "datasources" provided to PrismaClient constructor`);
        for (let [r, n] of Object.entries(t)) {
          if (!e.includes(r)) {
            let i = gt(r, e) || ` Available datasources: ${e.join(", ")}`;
            throw new F(`Unknown datasource ${r} provided to PrismaClient constructor.${i}`);
          }
          if (typeof n != "object" || Array.isArray(n)) throw new F(`Invalid value ${JSON.stringify(t)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
          if (n && typeof n == "object") for (let [i, o] of Object.entries(n)) {
            if (i !== "url") throw new F(`Invalid value ${JSON.stringify(t)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
            if (typeof o != "string") throw new F(`Invalid value ${JSON.stringify(o)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
          }
        }
      }
    }, "datasources"), adapter: /* @__PURE__ */ __name((t, e) => {
      if (!t && Je(e.generator) === "client") throw new F('Using engine type "client" requires a driver adapter to be provided to PrismaClient constructor.');
      if (t !== null) {
        if (t === void 0) throw new F('"adapter" property must not be undefined, use null to conditionally disable driver adapters.');
        if (Je(e.generator) === "binary") throw new F('Cannot use a driver adapter with the "binary" Query Engine. Please use the "library" Query Engine.');
      }
    }, "adapter"), datasourceUrl: /* @__PURE__ */ __name((t) => {
      if (typeof t < "u" && typeof t != "string") throw new F(`Invalid value ${JSON.stringify(t)} for "datasourceUrl" provided to PrismaClient constructor.
Expected string or undefined.`);
    }, "datasourceUrl"), errorFormat: /* @__PURE__ */ __name((t) => {
      if (t) {
        if (typeof t != "string") throw new F(`Invalid value ${JSON.stringify(t)} for "errorFormat" provided to PrismaClient constructor.`);
        if (!Ss.includes(t)) {
          let e = gt(t, Ss);
          throw new F(`Invalid errorFormat ${t} provided to PrismaClient constructor.${e}`);
        }
      }
    }, "errorFormat"), log: /* @__PURE__ */ __name((t) => {
      if (!t) return;
      if (!Array.isArray(t)) throw new F(`Invalid value ${JSON.stringify(t)} for "log" provided to PrismaClient constructor.`);
      function e(r) {
        if (typeof r == "string" && !Is.includes(r)) {
          let n = gt(r, Is);
          throw new F(`Invalid log level "${r}" provided to PrismaClient constructor.${n}`);
        }
      }
      __name(e, "e");
      for (let r of t) {
        e(r);
        let n = { level: e, emit: /* @__PURE__ */ __name((i) => {
          let o = ["stdout", "event"];
          if (!o.includes(i)) {
            let s = gt(i, o);
            throw new F(`Invalid value ${JSON.stringify(i)} for "emit" in logLevel provided to PrismaClient constructor.${s}`);
          }
        }, "emit") };
        if (r && typeof r == "object") for (let [i, o] of Object.entries(r)) if (n[i]) n[i](o);
        else throw new F(`Invalid property ${i} for "log" provided to PrismaClient constructor`);
      }
    }, "log"), transactionOptions: /* @__PURE__ */ __name((t) => {
      if (!t) return;
      let e = t.maxWait;
      if (e != null && e <= 0) throw new F(`Invalid value ${e} for maxWait in "transactionOptions" provided to PrismaClient constructor. maxWait needs to be greater than 0`);
      let r = t.timeout;
      if (r != null && r <= 0) throw new F(`Invalid value ${r} for timeout in "transactionOptions" provided to PrismaClient constructor. timeout needs to be greater than 0`);
    }, "transactionOptions"), omit: /* @__PURE__ */ __name((t, e) => {
      if (typeof t != "object") throw new F('"omit" option is expected to be an object.');
      if (t === null) throw new F('"omit" option can not be `null`');
      let r = [];
      for (let [n, i] of Object.entries(t)) {
        let o = ju(n, e.runtimeDataModel);
        if (!o) {
          r.push({ kind: "UnknownModel", modelKey: n });
          continue;
        }
        for (let [s, a] of Object.entries(i)) {
          let f = o.fields.find((v) => v.name === s);
          if (!f) {
            r.push({ kind: "UnknownField", modelKey: n, fieldName: s });
            continue;
          }
          if (f.relationName) {
            r.push({ kind: "RelationInOmit", modelKey: n, fieldName: s });
            continue;
          }
          typeof a != "boolean" && r.push({ kind: "InvalidFieldValue", modelKey: n, fieldName: s });
        }
      }
      if (r.length > 0) throw new F(Qu(t, r));
    }, "omit"), __internal: /* @__PURE__ */ __name((t) => {
      if (!t) return;
      let e = ["debug", "engine", "configOverride"];
      if (typeof t != "object") throw new F(`Invalid value ${JSON.stringify(t)} for "__internal" to PrismaClient constructor`);
      for (let [r] of Object.entries(t)) if (!e.includes(r)) {
        let n = gt(r, e);
        throw new F(`Invalid property ${JSON.stringify(r)} for "__internal" provided to PrismaClient constructor.${n}`);
      }
    }, "__internal") };
    function ks(t, e) {
      for (let [r, n] of Object.entries(t)) {
        if (!Cs.includes(r)) {
          let i = gt(r, Cs);
          throw new F(`Unknown property ${r} provided to PrismaClient constructor.${i}`);
        }
        Bu[r](n, e);
      }
      if (t.datasourceUrl && t.datasources) throw new F('Can not use "datasourceUrl" and "datasources" options at the same time. Pick one of them');
    }
    __name(ks, "ks");
    function gt(t, e) {
      if (e.length === 0 || typeof t != "string") return "";
      let r = $u(t, e);
      return r ? ` Did you mean "${r}"?` : "";
    }
    __name(gt, "gt");
    function $u(t, e) {
      if (e.length === 0) return null;
      let r = e.map((i) => ({ value: i, distance: (0, Os.default)(t, i) }));
      r.sort((i, o) => i.distance < o.distance ? -1 : 1);
      let n = r[0];
      return n.distance < 3 ? n.value : null;
    }
    __name($u, "$u");
    function ju(t, e) {
      return Ds(e.models, t) ?? Ds(e.types, t);
    }
    __name(ju, "ju");
    function Ds(t, e) {
      let r = Object.keys(t).find((n) => Ce(n) === e);
      if (r) return t[r];
    }
    __name(Ds, "Ds");
    function Qu(t, e) {
      let r = tt(t);
      for (let o of e) switch (o.kind) {
        case "UnknownModel":
          r.arguments.getField(o.modelKey)?.markAsError(), r.addErrorMessage(() => `Unknown model name: ${o.modelKey}.`);
          break;
        case "UnknownField":
          r.arguments.getDeepField([o.modelKey, o.fieldName])?.markAsError(), r.addErrorMessage(() => `Model "${o.modelKey}" does not have a field named "${o.fieldName}".`);
          break;
        case "RelationInOmit":
          r.arguments.getDeepField([o.modelKey, o.fieldName])?.markAsError(), r.addErrorMessage(() => 'Relations are already excluded by default and can not be specified in "omit".');
          break;
        case "InvalidFieldValue":
          r.arguments.getDeepFieldValue([o.modelKey, o.fieldName])?.markAsError(), r.addErrorMessage(() => "Omit field option value must be a boolean.");
          break;
      }
      let { message: n, args: i } = Sr(r, "colorless");
      return `Error validating "omit" option:

${i}

${n}`;
    }
    __name(Qu, "Qu");
    u();
    c();
    p();
    m();
    d();
    l();
    function _s(t) {
      return t.length === 0 ? Promise.resolve([]) : new Promise((e, r) => {
        let n = new Array(t.length), i = null, o = false, s = 0, a = /* @__PURE__ */ __name(() => {
          o || (s++, s === t.length && (o = true, i ? r(i) : e(n)));
        }, "a"), f = /* @__PURE__ */ __name((v) => {
          o || (o = true, r(v));
        }, "f");
        for (let v = 0; v < t.length; v++) t[v].then((R) => {
          n[v] = R, a();
        }, (R) => {
          if (!jr(R)) {
            f(R);
            return;
          }
          R.batchRequestIdx === v ? f(R) : (i || (i = R), a());
        });
      });
    }
    __name(_s, "_s");
    var De = j("prisma:client");
    typeof globalThis == "object" && (globalThis.NODE_CLIENT = true);
    var Gu = { requestArgsToMiddlewareArgs: /* @__PURE__ */ __name((t) => t, "requestArgsToMiddlewareArgs"), middlewareArgsToRequestArgs: /* @__PURE__ */ __name((t) => t, "middlewareArgsToRequestArgs") };
    var Ju = /* @__PURE__ */ Symbol.for("prisma.client.transaction.id");
    var Wu = { id: 0, nextId() {
      return ++this.id;
    } };
    function Fs(t) {
      class e {
        static {
          __name(this, "e");
        }
        _originalClient = this;
        _runtimeDataModel;
        _requestHandler;
        _connectionPromise;
        _disconnectionPromise;
        _engineConfig;
        _accelerateEngineConfig;
        _clientVersion;
        _errorFormat;
        _tracingHelper;
        _previewFeatures;
        _activeProvider;
        _globalOmit;
        _extensions;
        _engine;
        _appliedParent;
        _createPrismaPromise = Gn();
        constructor(n) {
          t = n?.__internal?.configOverride?.(t) ?? t, Jo(t), n && ks(n, t);
          let i = new Fr().on("error", () => {
          });
          this._extensions = rt.empty(), this._previewFeatures = us(t), this._clientVersion = t.clientVersion ?? As, this._activeProvider = t.activeProvider, this._globalOmit = n?.omit, this._tracingHelper = ws();
          let o = t.relativeEnvPaths && { rootEnvPath: t.relativeEnvPaths.rootEnvPath && cr.resolve(t.dirname, t.relativeEnvPaths.rootEnvPath), schemaEnvPath: t.relativeEnvPaths.schemaEnvPath && cr.resolve(t.dirname, t.relativeEnvPaths.schemaEnvPath) }, s;
          if (n?.adapter) {
            s = n.adapter;
            let f = t.activeProvider === "postgresql" || t.activeProvider === "cockroachdb" ? "postgres" : t.activeProvider;
            if (s.provider !== f) throw new M(`The Driver Adapter \`${s.adapterName}\`, based on \`${s.provider}\`, is not compatible with the provider \`${f}\` specified in the Prisma schema.`, this._clientVersion);
            if (n.datasources || n.datasourceUrl !== void 0) throw new M("Custom datasource configuration is not compatible with Prisma Driver Adapters. Please define the database connection string directly in the Driver Adapter configuration.", this._clientVersion);
          }
          let a = t.injectableEdgeEnv?.();
          try {
            let f = n ?? {}, v = f.__internal ?? {}, R = v.debug === true;
            R && j.enable("prisma:client");
            let A = cr.resolve(t.dirname, t.relativePath);
            Pi.existsSync(A) || (A = t.dirname), De("dirname", t.dirname), De("relativePath", t.relativePath), De("cwd", A);
            let I = v.engine || {};
            if (f.errorFormat ? this._errorFormat = f.errorFormat : g.env.NODE_ENV === "production" ? this._errorFormat = "minimal" : g.env.NO_COLOR ? this._errorFormat = "colorless" : this._errorFormat = "colorless", this._runtimeDataModel = t.runtimeDataModel, this._engineConfig = { cwd: A, dirname: t.dirname, enableDebugLogs: R, allowTriggerPanic: I.allowTriggerPanic, prismaPath: I.binaryPath ?? void 0, engineEndpoint: I.endpoint, generator: t.generator, showColors: this._errorFormat === "pretty", logLevel: f.log && Ps(f.log), logQueries: f.log && !!(typeof f.log == "string" ? f.log === "query" : f.log.find((C) => typeof C == "string" ? C === "query" : C.level === "query")), env: a?.parsed ?? {}, flags: [], engineWasm: t.engineWasm, compilerWasm: t.compilerWasm, clientVersion: t.clientVersion, engineVersion: t.engineVersion, previewFeatures: this._previewFeatures, activeProvider: t.activeProvider, inlineSchema: t.inlineSchema, overrideDatasources: Wo(f, t.datasourceNames), inlineDatasources: t.inlineDatasources, inlineSchemaHash: t.inlineSchemaHash, tracingHelper: this._tracingHelper, transactionOptions: { maxWait: f.transactionOptions?.maxWait ?? 2e3, timeout: f.transactionOptions?.timeout ?? 5e3, isolationLevel: f.transactionOptions?.isolationLevel }, logEmitter: i, isBundled: t.isBundled, adapter: s }, this._accelerateEngineConfig = { ...this._engineConfig, accelerateUtils: { resolveDatasourceUrl: ct, getBatchRequestPayload: ot, prismaGraphQLToJSError: st, PrismaClientUnknownRequestError: Q, PrismaClientInitializationError: M, PrismaClientKnownRequestError: X, debug: j("prisma:client:accelerateEngine"), engineVersion: Ls.version, clientVersion: t.clientVersion } }, De("clientVersion", t.clientVersion), this._engine = ls(t, this._engineConfig), this._requestHandler = new Jr(this, i), f.log) for (let C of f.log) {
              let L = typeof C == "string" ? C : C.emit === "stdout" ? C.level : null;
              L && this.$on(L, (D) => {
                Pt.log(`${Pt.tags[L] ?? ""}`, D.message || D.query);
              });
            }
          } catch (f) {
            throw f.clientVersion = this._clientVersion, f;
          }
          return this._appliedParent = Ut(this);
        }
        get [Symbol.toStringTag]() {
          return "PrismaClient";
        }
        $on(n, i) {
          return n === "beforeExit" ? this._engine.onBeforeExit(i) : n && this._engineConfig.logEmitter.on(n, i), this;
        }
        $connect() {
          try {
            return this._engine.start();
          } catch (n) {
            throw n.clientVersion = this._clientVersion, n;
          }
        }
        async $disconnect() {
          try {
            await this._engine.stop();
          } catch (n) {
            throw n.clientVersion = this._clientVersion, n;
          } finally {
            xi();
          }
        }
        $executeRawInternal(n, i, o, s) {
          let a = this._activeProvider;
          return this._request({ action: "executeRaw", args: o, transaction: n, clientMethod: i, argsMapper: Qn({ clientMethod: i, activeProvider: a }), callsite: Ie(this._errorFormat), dataPath: [], middlewareArgsMapper: s });
        }
        $executeRaw(n, ...i) {
          return this._createPrismaPromise((o) => {
            if (n.raw !== void 0 || n.sql !== void 0) {
              let [s, a] = Ms(n, i);
              return jn(this._activeProvider, s.text, s.values, Array.isArray(n) ? "prisma.$executeRaw`<SQL>`" : "prisma.$executeRaw(sql`<SQL>`)"), this.$executeRawInternal(o, "$executeRaw", s, a);
            }
            throw new Y("`$executeRaw` is a tag function, please use it like the following:\n```\nconst result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`\n```\n\nOr read our docs at https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access#executeraw\n", { clientVersion: this._clientVersion });
          });
        }
        $executeRawUnsafe(n, ...i) {
          return this._createPrismaPromise((o) => (jn(this._activeProvider, n, i, "prisma.$executeRawUnsafe(<SQL>, [...values])"), this.$executeRawInternal(o, "$executeRawUnsafe", [n, ...i])));
        }
        $runCommandRaw(n) {
          if (t.activeProvider !== "mongodb") throw new Y(`The ${t.activeProvider} provider does not support $runCommandRaw. Use the mongodb provider.`, { clientVersion: this._clientVersion });
          return this._createPrismaPromise((i) => this._request({ args: n, clientMethod: "$runCommandRaw", dataPath: [], action: "runCommandRaw", argsMapper: cs, callsite: Ie(this._errorFormat), transaction: i }));
        }
        async $queryRawInternal(n, i, o, s) {
          let a = this._activeProvider;
          return this._request({ action: "queryRaw", args: o, transaction: n, clientMethod: i, argsMapper: Qn({ clientMethod: i, activeProvider: a }), callsite: Ie(this._errorFormat), dataPath: [], middlewareArgsMapper: s });
        }
        $queryRaw(n, ...i) {
          return this._createPrismaPromise((o) => {
            if (n.raw !== void 0 || n.sql !== void 0) return this.$queryRawInternal(o, "$queryRaw", ...Ms(n, i));
            throw new Y("`$queryRaw` is a tag function, please use it like the following:\n```\nconst result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`\n```\n\nOr read our docs at https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access#queryraw\n", { clientVersion: this._clientVersion });
          });
        }
        $queryRawTyped(n) {
          return this._createPrismaPromise((i) => {
            if (!this._hasPreviewFlag("typedSql")) throw new Y("`typedSql` preview feature must be enabled in order to access $queryRawTyped API", { clientVersion: this._clientVersion });
            return this.$queryRawInternal(i, "$queryRawTyped", n);
          });
        }
        $queryRawUnsafe(n, ...i) {
          return this._createPrismaPromise((o) => this.$queryRawInternal(o, "$queryRawUnsafe", [n, ...i]));
        }
        _transactionWithArray({ promises: n, options: i }) {
          let o = Wu.nextId(), s = xs(n.length), a = n.map((f, v) => {
            if (f?.[Symbol.toStringTag] !== "PrismaPromise") throw new Error("All elements of the array need to be Prisma Client promises. Hint: Please make sure you are not awaiting the Prisma client calls you intended to pass in the $transaction function.");
            let R = i?.isolationLevel ?? this._engineConfig.transactionOptions.isolationLevel, A = { kind: "batch", id: o, index: v, isolationLevel: R, lock: s };
            return f.requestTransaction?.(A) ?? f;
          });
          return _s(a);
        }
        async _transactionWithCallback({ callback: n, options: i }) {
          let o = { traceparent: this._tracingHelper.getTraceParent() }, s = { maxWait: i?.maxWait ?? this._engineConfig.transactionOptions.maxWait, timeout: i?.timeout ?? this._engineConfig.transactionOptions.timeout, isolationLevel: i?.isolationLevel ?? this._engineConfig.transactionOptions.isolationLevel }, a = await this._engine.transaction("start", o, s), f;
          try {
            let v = { kind: "itx", ...a };
            f = await n(this._createItxClient(v)), await this._engine.transaction("commit", o, a);
          } catch (v) {
            throw await this._engine.transaction("rollback", o, a).catch(() => {
            }), v;
          }
          return f;
        }
        _createItxClient(n) {
          return ce(Ut(ce(Oo(this), [Z("_appliedParent", () => this._appliedParent._createItxClient(n)), Z("_createPrismaPromise", () => Gn(n)), Z(Ju, () => n.id)])), [it(Fo)]);
        }
        $transaction(n, i) {
          let o;
          typeof n == "function" ? this._engineConfig.adapter?.adapterName === "@prisma/adapter-d1" ? o = /* @__PURE__ */ __name(() => {
            throw new Error("Cloudflare D1 does not support interactive transactions. We recommend you to refactor your queries with that limitation in mind, and use batch transactions with `prisma.$transactions([])` where applicable.");
          }, "o") : o = /* @__PURE__ */ __name(() => this._transactionWithCallback({ callback: n, options: i }), "o") : o = /* @__PURE__ */ __name(() => this._transactionWithArray({ promises: n, options: i }), "o");
          let s = { name: "transaction", attributes: { method: "$transaction" } };
          return this._tracingHelper.runInChildSpan(s, o);
        }
        _request(n) {
          n.otelParentCtx = this._tracingHelper.getActiveContext();
          let i = n.middlewareArgsMapper ?? Gu, o = { args: i.requestArgsToMiddlewareArgs(n.args), dataPath: n.dataPath, runInTransaction: !!n.transaction, action: n.action, model: n.model }, s = { operation: { name: "operation", attributes: { method: o.action, model: o.model, name: o.model ? `${o.model}.${o.action}` : o.action } } }, a = /* @__PURE__ */ __name(async (f) => {
            let { runInTransaction: v, args: R, ...A } = f, I = { ...n, ...A };
            R && (I.args = i.middlewareArgsToRequestArgs(R)), n.transaction !== void 0 && v === false && delete I.transaction;
            let C = await Vo(this, I);
            return I.model ? Lo({ result: C, modelName: I.model, args: I.args, extensions: this._extensions, runtimeDataModel: this._runtimeDataModel, globalOmit: this._globalOmit }) : C;
          }, "a");
          return this._tracingHelper.runInChildSpan(s.operation, () => a(o));
        }
        async _executeRequest({ args: n, clientMethod: i, dataPath: o, callsite: s, action: a, model: f, argsMapper: v, transaction: R, unpacker: A, otelParentCtx: I, customDataProxyFetch: C }) {
          try {
            n = v ? v(n) : n;
            let L = { name: "serialize" }, D = this._tracingHelper.runInChildSpan(L, () => _r({ modelName: f, runtimeDataModel: this._runtimeDataModel, action: a, args: n, clientMethod: i, callsite: s, extensions: this._extensions, errorFormat: this._errorFormat, clientVersion: this._clientVersion, previewFeatures: this._previewFeatures, globalOmit: this._globalOmit }));
            return j.enabled("prisma:client") && (De("Prisma Client call:"), De(`prisma.${i}(${xo(n)})`), De("Generated request:"), De(JSON.stringify(D, null, 2) + `
`)), R?.kind === "batch" && await R.lock, this._requestHandler.request({ protocolQuery: D, modelName: f, action: a, clientMethod: i, dataPath: o, callsite: s, args: n, extensions: this._extensions, transaction: R, unpacker: A, otelParentCtx: I, otelChildCtx: this._tracingHelper.getActiveContext(), globalOmit: this._globalOmit, customDataProxyFetch: C });
          } catch (L) {
            throw L.clientVersion = this._clientVersion, L;
          }
        }
        $metrics = new nt(this);
        _hasPreviewFlag(n) {
          return !!this._engineConfig.previewFeatures?.includes(n);
        }
        $applyPendingMigrations() {
          return this._engine.applyPendingMigrations();
        }
        $extends = ko;
      }
      return e;
    }
    __name(Fs, "Fs");
    function Ms(t, e) {
      return Ku(t) ? [new ne(t, e), hs] : [t, bs];
    }
    __name(Ms, "Ms");
    function Ku(t) {
      return Array.isArray(t) && Array.isArray(t.raw);
    }
    __name(Ku, "Ku");
    u();
    c();
    p();
    m();
    d();
    l();
    var Hu = /* @__PURE__ */ new Set(["toJSON", "$$typeof", "asymmetricMatch", Symbol.iterator, Symbol.toStringTag, Symbol.isConcatSpreadable, Symbol.toPrimitive]);
    function Ns(t) {
      return new Proxy(t, { get(e, r) {
        if (r in e) return e[r];
        if (!Hu.has(r)) throw new TypeError(`Invalid enum value: ${String(r)}`);
      } });
    }
    __name(Ns, "Ns");
    u();
    c();
    p();
    m();
    d();
    l();
    l();
  }
});

// ../node_modules/.prisma/client/query_engine_bg.js
var require_query_engine_bg = __commonJS({
  "../node_modules/.prisma/client/query_engine_bg.js"(exports, module) {
    "use strict";
    var F = Object.defineProperty;
    var j = Object.getOwnPropertyDescriptor;
    var B = Object.getOwnPropertyNames;
    var U = Object.prototype.hasOwnProperty;
    var L = /* @__PURE__ */ __name((e, t) => {
      for (var n in t) F(e, n, { get: t[n], enumerable: true });
    }, "L");
    var N = /* @__PURE__ */ __name((e, t, n, r) => {
      if (t && typeof t == "object" || typeof t == "function") for (let o of B(t)) !U.call(e, o) && o !== n && F(e, o, { get: /* @__PURE__ */ __name(() => t[o], "get"), enumerable: !(r = j(t, o)) || r.enumerable });
      return e;
    }, "N");
    var C = /* @__PURE__ */ __name((e) => N(F({}, "__esModule", { value: true }), e), "C");
    var kt = {};
    L(kt, { QueryEngine: /* @__PURE__ */ __name(() => k, "QueryEngine"), __wbg_Error_e83987f665cf5504: /* @__PURE__ */ __name(() => J, "__wbg_Error_e83987f665cf5504"), __wbg_Number_bb48ca12f395cd08: /* @__PURE__ */ __name(() => X, "__wbg_Number_bb48ca12f395cd08"), __wbg_String_8f0eb39a4a4c2f66: /* @__PURE__ */ __name(() => Y, "__wbg_String_8f0eb39a4a4c2f66"), __wbg___wbindgen_bigint_get_as_i64_f3ebc5a755000afd: /* @__PURE__ */ __name(() => K, "__wbg___wbindgen_bigint_get_as_i64_f3ebc5a755000afd"), __wbg___wbindgen_boolean_get_6d5a1ee65bab5f68: /* @__PURE__ */ __name(() => Z, "__wbg___wbindgen_boolean_get_6d5a1ee65bab5f68"), __wbg___wbindgen_debug_string_df47ffb5e35e6763: /* @__PURE__ */ __name(() => ee, "__wbg___wbindgen_debug_string_df47ffb5e35e6763"), __wbg___wbindgen_in_bb933bd9e1b3bc0f: /* @__PURE__ */ __name(() => te, "__wbg___wbindgen_in_bb933bd9e1b3bc0f"), __wbg___wbindgen_is_bigint_cb320707dcd35f0b: /* @__PURE__ */ __name(() => ne, "__wbg___wbindgen_is_bigint_cb320707dcd35f0b"), __wbg___wbindgen_is_function_ee8a6c5833c90377: /* @__PURE__ */ __name(() => re, "__wbg___wbindgen_is_function_ee8a6c5833c90377"), __wbg___wbindgen_is_object_c818261d21f283a4: /* @__PURE__ */ __name(() => _e, "__wbg___wbindgen_is_object_c818261d21f283a4"), __wbg___wbindgen_is_string_fbb76cb2940daafd: /* @__PURE__ */ __name(() => oe, "__wbg___wbindgen_is_string_fbb76cb2940daafd"), __wbg___wbindgen_is_undefined_2d472862bd29a478: /* @__PURE__ */ __name(() => ce, "__wbg___wbindgen_is_undefined_2d472862bd29a478"), __wbg___wbindgen_jsval_eq_6b13ab83478b1c50: /* @__PURE__ */ __name(() => ie, "__wbg___wbindgen_jsval_eq_6b13ab83478b1c50"), __wbg___wbindgen_jsval_loose_eq_b664b38a2f582147: /* @__PURE__ */ __name(() => ue, "__wbg___wbindgen_jsval_loose_eq_b664b38a2f582147"), __wbg___wbindgen_number_get_a20bf9b85341449d: /* @__PURE__ */ __name(() => se, "__wbg___wbindgen_number_get_a20bf9b85341449d"), __wbg___wbindgen_string_get_e4f06c90489ad01b: /* @__PURE__ */ __name(() => be, "__wbg___wbindgen_string_get_e4f06c90489ad01b"), __wbg___wbindgen_throw_b855445ff6a94295: /* @__PURE__ */ __name(() => fe, "__wbg___wbindgen_throw_b855445ff6a94295"), __wbg__wbg_cb_unref_2454a539ea5790d9: /* @__PURE__ */ __name(() => ae, "__wbg__wbg_cb_unref_2454a539ea5790d9"), __wbg_call_525440f72fbfc0ea: /* @__PURE__ */ __name(() => ge, "__wbg_call_525440f72fbfc0ea"), __wbg_call_e762c39fa8ea36bf: /* @__PURE__ */ __name(() => le, "__wbg_call_e762c39fa8ea36bf"), __wbg_crypto_805be4ce92f1e370: /* @__PURE__ */ __name(() => de, "__wbg_crypto_805be4ce92f1e370"), __wbg_done_2042aa2670fb1db1: /* @__PURE__ */ __name(() => we, "__wbg_done_2042aa2670fb1db1"), __wbg_entries_e171b586f8f6bdbf: /* @__PURE__ */ __name(() => pe, "__wbg_entries_e171b586f8f6bdbf"), __wbg_exec_fdeec61d47617356: /* @__PURE__ */ __name(() => xe, "__wbg_exec_fdeec61d47617356"), __wbg_getRandomValues_f6a868620c8bab49: /* @__PURE__ */ __name(() => ye, "__wbg_getRandomValues_f6a868620c8bab49"), __wbg_getTime_14776bfb48a1bff9: /* @__PURE__ */ __name(() => me, "__wbg_getTime_14776bfb48a1bff9"), __wbg_get_7bed016f185add81: /* @__PURE__ */ __name(() => he, "__wbg_get_7bed016f185add81"), __wbg_get_ece95cf6585650d9: /* @__PURE__ */ __name(() => Te, "__wbg_get_ece95cf6585650d9"), __wbg_get_efcb449f58ec27c2: /* @__PURE__ */ __name(() => Ae, "__wbg_get_efcb449f58ec27c2"), __wbg_get_with_ref_key_1dc361bd10053bfe: /* @__PURE__ */ __name(() => Se, "__wbg_get_with_ref_key_1dc361bd10053bfe"), __wbg_has_787fafc980c3ccdb: /* @__PURE__ */ __name(() => Fe, "__wbg_has_787fafc980c3ccdb"), __wbg_instanceof_ArrayBuffer_70beb1189ca63b38: /* @__PURE__ */ __name(() => Ie, "__wbg_instanceof_ArrayBuffer_70beb1189ca63b38"), __wbg_instanceof_Map_8579b5e2ab5437c7: /* @__PURE__ */ __name(() => qe, "__wbg_instanceof_Map_8579b5e2ab5437c7"), __wbg_instanceof_Promise_001fdd42afa1b7ef: /* @__PURE__ */ __name(() => Ee, "__wbg_instanceof_Promise_001fdd42afa1b7ef"), __wbg_instanceof_Uint8Array_20c8e73002f7af98: /* @__PURE__ */ __name(() => ke, "__wbg_instanceof_Uint8Array_20c8e73002f7af98"), __wbg_isArray_96e0af9891d0945d: /* @__PURE__ */ __name(() => Oe, "__wbg_isArray_96e0af9891d0945d"), __wbg_isSafeInteger_d216eda7911dde36: /* @__PURE__ */ __name(() => Me, "__wbg_isSafeInteger_d216eda7911dde36"), __wbg_iterator_e5822695327a3c39: /* @__PURE__ */ __name(() => ve, "__wbg_iterator_e5822695327a3c39"), __wbg_keys_b4d27b02ad14f4be: /* @__PURE__ */ __name(() => De, "__wbg_keys_b4d27b02ad14f4be"), __wbg_length_69bca3cb64fc8748: /* @__PURE__ */ __name(() => Re, "__wbg_length_69bca3cb64fc8748"), __wbg_length_cdd215e10d9dd507: /* @__PURE__ */ __name(() => je, "__wbg_length_cdd215e10d9dd507"), __wbg_msCrypto_2ac4d17c4748234a: /* @__PURE__ */ __name(() => Be, "__wbg_msCrypto_2ac4d17c4748234a"), __wbg_new_0_f9740686d739025c: /* @__PURE__ */ __name(() => Ue, "__wbg_new_0_f9740686d739025c"), __wbg_new_1acc0b6eea89d040: /* @__PURE__ */ __name(() => Le, "__wbg_new_1acc0b6eea89d040"), __wbg_new_23fa8b12a239f036: /* @__PURE__ */ __name(() => Ne, "__wbg_new_23fa8b12a239f036"), __wbg_new_3c3d849046688a66: /* @__PURE__ */ __name(() => Ce, "__wbg_new_3c3d849046688a66"), __wbg_new_5a79be3ab53b8aa5: /* @__PURE__ */ __name(() => $e, "__wbg_new_5a79be3ab53b8aa5"), __wbg_new_68651c719dcda04e: /* @__PURE__ */ __name(() => Ve, "__wbg_new_68651c719dcda04e"), __wbg_new_e17d9f43105b08be: /* @__PURE__ */ __name(() => We, "__wbg_new_e17d9f43105b08be"), __wbg_new_from_slice_92f4d78ca282a2d2: /* @__PURE__ */ __name(() => ze, "__wbg_new_from_slice_92f4d78ca282a2d2"), __wbg_new_no_args_ee98eee5275000a4: /* @__PURE__ */ __name(() => Pe, "__wbg_new_no_args_ee98eee5275000a4"), __wbg_new_with_length_01aa0dc35aa13543: /* @__PURE__ */ __name(() => Ge, "__wbg_new_with_length_01aa0dc35aa13543"), __wbg_next_020810e0ae8ebcb0: /* @__PURE__ */ __name(() => Qe, "__wbg_next_020810e0ae8ebcb0"), __wbg_next_2c826fe5dfec6b6a: /* @__PURE__ */ __name(() => He, "__wbg_next_2c826fe5dfec6b6a"), __wbg_node_ecc8306b9857f33d: /* @__PURE__ */ __name(() => Je, "__wbg_node_ecc8306b9857f33d"), __wbg_now_793306c526e2e3b6: /* @__PURE__ */ __name(() => Xe, "__wbg_now_793306c526e2e3b6"), __wbg_now_7fd00a794a07d388: /* @__PURE__ */ __name(() => Ye, "__wbg_now_7fd00a794a07d388"), __wbg_now_b3f7572f6ef3d3a9: /* @__PURE__ */ __name(() => Ke, "__wbg_now_b3f7572f6ef3d3a9"), __wbg_process_5cff2739921be718: /* @__PURE__ */ __name(() => Ze, "__wbg_process_5cff2739921be718"), __wbg_prototypesetcall_2a6620b6922694b2: /* @__PURE__ */ __name(() => et, "__wbg_prototypesetcall_2a6620b6922694b2"), __wbg_push_df81a39d04db858c: /* @__PURE__ */ __name(() => tt, "__wbg_push_df81a39d04db858c"), __wbg_queueMicrotask_5a8a9131f3f0b37b: /* @__PURE__ */ __name(() => nt, "__wbg_queueMicrotask_5a8a9131f3f0b37b"), __wbg_queueMicrotask_6d79674585219521: /* @__PURE__ */ __name(() => rt, "__wbg_queueMicrotask_6d79674585219521"), __wbg_randomFillSync_d3c85af7e31cf1f8: /* @__PURE__ */ __name(() => _t, "__wbg_randomFillSync_d3c85af7e31cf1f8"), __wbg_require_0c566c6f2eef6c79: /* @__PURE__ */ __name(() => ot, "__wbg_require_0c566c6f2eef6c79"), __wbg_resolve_caf97c30b83f7053: /* @__PURE__ */ __name(() => ct, "__wbg_resolve_caf97c30b83f7053"), __wbg_setTimeout_5d6a1d4fc51ea450: /* @__PURE__ */ __name(() => it, "__wbg_setTimeout_5d6a1d4fc51ea450"), __wbg_set_3f1d0b984ed272ed: /* @__PURE__ */ __name(() => ut, "__wbg_set_3f1d0b984ed272ed"), __wbg_set_907fb406c34a251d: /* @__PURE__ */ __name(() => st, "__wbg_set_907fb406c34a251d"), __wbg_set_c213c871859d6500: /* @__PURE__ */ __name(() => bt, "__wbg_set_c213c871859d6500"), __wbg_set_c2abbebe8b9ebee1: /* @__PURE__ */ __name(() => ft, "__wbg_set_c2abbebe8b9ebee1"), __wbg_set_wasm: /* @__PURE__ */ __name(() => $2, "__wbg_set_wasm"), __wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e: /* @__PURE__ */ __name(() => at, "__wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e"), __wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac: /* @__PURE__ */ __name(() => gt, "__wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac"), __wbg_static_accessor_SELF_6fdf4b64710cc91b: /* @__PURE__ */ __name(() => lt, "__wbg_static_accessor_SELF_6fdf4b64710cc91b"), __wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2: /* @__PURE__ */ __name(() => dt, "__wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2"), __wbg_subarray_480600f3d6a9f26c: /* @__PURE__ */ __name(() => wt, "__wbg_subarray_480600f3d6a9f26c"), __wbg_then_4f46f6544e6b4a28: /* @__PURE__ */ __name(() => pt, "__wbg_then_4f46f6544e6b4a28"), __wbg_then_70d05cf780a18d77: /* @__PURE__ */ __name(() => xt, "__wbg_then_70d05cf780a18d77"), __wbg_valueOf_9eee4828c11458ca: /* @__PURE__ */ __name(() => yt, "__wbg_valueOf_9eee4828c11458ca"), __wbg_value_692627309814bb8c: /* @__PURE__ */ __name(() => mt, "__wbg_value_692627309814bb8c"), __wbg_versions_a8e5a362e1f16442: /* @__PURE__ */ __name(() => ht, "__wbg_versions_a8e5a362e1f16442"), __wbindgen_cast_2241b6af4c4b2941: /* @__PURE__ */ __name(() => Tt, "__wbindgen_cast_2241b6af4c4b2941"), __wbindgen_cast_4625c577ab2ec9ee: /* @__PURE__ */ __name(() => At, "__wbindgen_cast_4625c577ab2ec9ee"), __wbindgen_cast_7bf296c42657ff30: /* @__PURE__ */ __name(() => St, "__wbindgen_cast_7bf296c42657ff30"), __wbindgen_cast_9ae0607507abb057: /* @__PURE__ */ __name(() => Ft, "__wbindgen_cast_9ae0607507abb057"), __wbindgen_cast_cb9088102bce6b30: /* @__PURE__ */ __name(() => It, "__wbindgen_cast_cb9088102bce6b30"), __wbindgen_cast_d6cd19b81560fd6e: /* @__PURE__ */ __name(() => qt, "__wbindgen_cast_d6cd19b81560fd6e"), __wbindgen_init_externref_table: /* @__PURE__ */ __name(() => Et, "__wbindgen_init_externref_table"), debug_panic: /* @__PURE__ */ __name(() => G, "debug_panic"), getBuildTimeInfo: /* @__PURE__ */ __name(() => P, "getBuildTimeInfo") });
    module.exports = C(kt);
    var T = /* @__PURE__ */ __name(() => {
    }, "T");
    T.prototype = T;
    var _;
    function $2(e) {
      _ = e;
    }
    __name($2, "$");
    var A = null;
    function y() {
      return (A === null || A.byteLength === 0) && (A = new Uint8Array(_.memory.buffer)), A;
    }
    __name(y, "y");
    var S = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    S.decode();
    var V = 2146435072;
    var I = 0;
    function W(e, t) {
      return I += t, I >= V && (S = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }), S.decode(), I = t), S.decode(y().subarray(e, e + t));
    }
    __name(W, "W");
    function w(e, t) {
      return e = e >>> 0, W(e, t);
    }
    __name(w, "w");
    var s = 0;
    var m = new TextEncoder();
    "encodeInto" in m || (m.encodeInto = function(e, t) {
      const n = m.encode(e);
      return t.set(n), { read: e.length, written: n.length };
    });
    function b(e, t, n) {
      if (n === void 0) {
        const u = m.encode(e), f = t(u.length, 1) >>> 0;
        return y().subarray(f, f + u.length).set(u), s = u.length, f;
      }
      let r = e.length, o = t(r, 1) >>> 0;
      const i = y();
      let c = 0;
      for (; c < r; c++) {
        const u = e.charCodeAt(c);
        if (u > 127) break;
        i[o + c] = u;
      }
      if (c !== r) {
        c !== 0 && (e = e.slice(c)), o = n(o, r, r = c + e.length * 3, 1) >>> 0;
        const u = y().subarray(o + c, o + r), f = m.encodeInto(e, u);
        c += f.written, o = n(o, r, c, 1) >>> 0;
      }
      return s = c, o;
    }
    __name(b, "b");
    var p = null;
    function l() {
      return (p === null || p.buffer.detached === true || p.buffer.detached === void 0 && p.buffer !== _.memory.buffer) && (p = new DataView(_.memory.buffer)), p;
    }
    __name(l, "l");
    function a(e) {
      return e == null;
    }
    __name(a, "a");
    function q(e) {
      const t = typeof e;
      if (t == "number" || t == "boolean" || e == null) return `${e}`;
      if (t == "string") return `"${e}"`;
      if (t == "symbol") {
        const o = e.description;
        return o == null ? "Symbol" : `Symbol(${o})`;
      }
      if (t == "function") {
        const o = e.name;
        return typeof o == "string" && o.length > 0 ? `Function(${o})` : "Function";
      }
      if (Array.isArray(e)) {
        const o = e.length;
        let i = "[";
        o > 0 && (i += q(e[0]));
        for (let c = 1; c < o; c++) i += ", " + q(e[c]);
        return i += "]", i;
      }
      const n = /\[object ([^\]]+)\]/.exec(toString.call(e));
      let r;
      if (n && n.length > 1) r = n[1];
      else return toString.call(e);
      if (r == "Object") try {
        return "Object(" + JSON.stringify(e) + ")";
      } catch {
        return "Object";
      }
      return e instanceof Error ? `${e.name}: ${e.message}
${e.stack}` : r;
    }
    __name(q, "q");
    function x(e) {
      const t = _.__externref_table_alloc();
      return _.__wbindgen_externrefs.set(t, e), t;
    }
    __name(x, "x");
    function g(e, t) {
      try {
        return e.apply(this, t);
      } catch (n) {
        const r = x(n);
        _.__wbindgen_exn_store(r);
      }
    }
    __name(g, "g");
    function E(e, t) {
      return e = e >>> 0, y().subarray(e / 1, e / 1 + t);
    }
    __name(E, "E");
    var O = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
    }, "register"), unregister: /* @__PURE__ */ __name(() => {
    }, "unregister") } : new FinalizationRegistry((e) => e.dtor(e.a, e.b));
    function z(e, t, n, r) {
      const o = { a: e, b: t, cnt: 1, dtor: n }, i = /* @__PURE__ */ __name((...c) => {
        o.cnt++;
        const u = o.a;
        o.a = 0;
        try {
          return r(u, o.b, ...c);
        } finally {
          o.a = u, i._wbg_cb_unref();
        }
      }, "i");
      return i._wbg_cb_unref = () => {
        --o.cnt === 0 && (o.dtor(o.a, o.b), o.a = 0, O.unregister(o));
      }, O.register(i, o, o), i;
    }
    __name(z, "z");
    function M(e) {
      const t = _.__wbindgen_externrefs.get(e);
      return _.__externref_table_dealloc(e), t;
    }
    __name(M, "M");
    function P() {
      return _.getBuildTimeInfo();
    }
    __name(P, "P");
    function G(e) {
      var t = a(e) ? 0 : b(e, _.__wbindgen_malloc, _.__wbindgen_realloc), n = s;
      const r = _.debug_panic(t, n);
      if (r[1]) throw M(r[0]);
    }
    __name(G, "G");
    function Q(e, t, n) {
      _.wasm_bindgen__convert__closures_____invoke__ha235f3ea55a06a09(e, t, n);
    }
    __name(Q, "Q");
    function H(e, t, n, r) {
      _.wasm_bindgen__convert__closures_____invoke__h1a2f20be69ab8911(e, t, n, r);
    }
    __name(H, "H");
    var v = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
    }, "register"), unregister: /* @__PURE__ */ __name(() => {
    }, "unregister") } : new FinalizationRegistry((e) => _.__wbg_queryengine_free(e >>> 0, 1));
    var k = class {
      static {
        __name(this, "k");
      }
      __destroy_into_raw() {
        const t = this.__wbg_ptr;
        return this.__wbg_ptr = 0, v.unregister(this), t;
      }
      free() {
        const t = this.__destroy_into_raw();
        _.__wbg_queryengine_free(t, 0);
      }
      disconnect(t, n) {
        const r = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), o = s, i = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), c = s;
        return _.queryengine_disconnect(this.__wbg_ptr, r, o, i, c);
      }
      startTransaction(t, n, r) {
        const o = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), i = s, c = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), u = s, f = b(r, _.__wbindgen_malloc, _.__wbindgen_realloc), d = s;
        return _.queryengine_startTransaction(this.__wbg_ptr, o, i, c, u, f, d);
      }
      commitTransaction(t, n, r) {
        const o = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), i = s, c = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), u = s, f = b(r, _.__wbindgen_malloc, _.__wbindgen_realloc), d = s;
        return _.queryengine_commitTransaction(this.__wbg_ptr, o, i, c, u, f, d);
      }
      rollbackTransaction(t, n, r) {
        const o = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), i = s, c = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), u = s, f = b(r, _.__wbindgen_malloc, _.__wbindgen_realloc), d = s;
        return _.queryengine_rollbackTransaction(this.__wbg_ptr, o, i, c, u, f, d);
      }
      constructor(t, n, r) {
        const o = _.queryengine_new(t, n, r);
        if (o[2]) throw M(o[1]);
        return this.__wbg_ptr = o[0] >>> 0, v.register(this, this.__wbg_ptr, this), this;
      }
      query(t, n, r, o) {
        const i = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), c = s, u = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), f = s;
        var d = a(r) ? 0 : b(r, _.__wbindgen_malloc, _.__wbindgen_realloc), h = s;
        const D = b(o, _.__wbindgen_malloc, _.__wbindgen_realloc), R = s;
        return _.queryengine_query(this.__wbg_ptr, i, c, u, f, d, h, D, R);
      }
      trace(t) {
        const n = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), r = s;
        return _.queryengine_trace(this.__wbg_ptr, n, r);
      }
      connect(t, n) {
        const r = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), o = s, i = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), c = s;
        return _.queryengine_connect(this.__wbg_ptr, r, o, i, c);
      }
      metrics(t) {
        const n = b(t, _.__wbindgen_malloc, _.__wbindgen_realloc), r = s;
        return _.queryengine_metrics(this.__wbg_ptr, n, r);
      }
    };
    Symbol.dispose && (k.prototype[Symbol.dispose] = k.prototype.free);
    function J(e, t) {
      return Error(w(e, t));
    }
    __name(J, "J");
    function X(e) {
      return Number(e);
    }
    __name(X, "X");
    function Y(e, t) {
      const n = String(t), r = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), o = s;
      l().setInt32(e + 4 * 1, o, true), l().setInt32(e + 4 * 0, r, true);
    }
    __name(Y, "Y");
    function K(e, t) {
      const n = t, r = typeof n == "bigint" ? n : void 0;
      l().setBigInt64(e + 8 * 1, a(r) ? BigInt(0) : r, true), l().setInt32(e + 4 * 0, !a(r), true);
    }
    __name(K, "K");
    function Z(e) {
      const t = e, n = typeof t == "boolean" ? t : void 0;
      return a(n) ? 16777215 : n ? 1 : 0;
    }
    __name(Z, "Z");
    function ee(e, t) {
      const n = q(t), r = b(n, _.__wbindgen_malloc, _.__wbindgen_realloc), o = s;
      l().setInt32(e + 4 * 1, o, true), l().setInt32(e + 4 * 0, r, true);
    }
    __name(ee, "ee");
    function te(e, t) {
      return e in t;
    }
    __name(te, "te");
    function ne(e) {
      return typeof e == "bigint";
    }
    __name(ne, "ne");
    function re(e) {
      return typeof e == "function";
    }
    __name(re, "re");
    function _e(e) {
      const t = e;
      return typeof t == "object" && t !== null;
    }
    __name(_e, "_e");
    function oe(e) {
      return typeof e == "string";
    }
    __name(oe, "oe");
    function ce(e) {
      return e === void 0;
    }
    __name(ce, "ce");
    function ie(e, t) {
      return e === t;
    }
    __name(ie, "ie");
    function ue(e, t) {
      return e == t;
    }
    __name(ue, "ue");
    function se(e, t) {
      const n = t, r = typeof n == "number" ? n : void 0;
      l().setFloat64(e + 8 * 1, a(r) ? 0 : r, true), l().setInt32(e + 4 * 0, !a(r), true);
    }
    __name(se, "se");
    function be(e, t) {
      const n = t, r = typeof n == "string" ? n : void 0;
      var o = a(r) ? 0 : b(r, _.__wbindgen_malloc, _.__wbindgen_realloc), i = s;
      l().setInt32(e + 4 * 1, i, true), l().setInt32(e + 4 * 0, o, true);
    }
    __name(be, "be");
    function fe(e, t) {
      throw new Error(w(e, t));
    }
    __name(fe, "fe");
    function ae(e) {
      e._wbg_cb_unref();
    }
    __name(ae, "ae");
    function ge() {
      return g(function(e, t, n) {
        return e.call(t, n);
      }, arguments);
    }
    __name(ge, "ge");
    function le() {
      return g(function(e, t) {
        return e.call(t);
      }, arguments);
    }
    __name(le, "le");
    function de(e) {
      return e.crypto;
    }
    __name(de, "de");
    function we(e) {
      return e.done;
    }
    __name(we, "we");
    function pe(e) {
      return Object.entries(e);
    }
    __name(pe, "pe");
    function xe(e, t, n) {
      const r = e.exec(w(t, n));
      return a(r) ? 0 : x(r);
    }
    __name(xe, "xe");
    function ye() {
      return g(function(e, t) {
        e.getRandomValues(t);
      }, arguments);
    }
    __name(ye, "ye");
    function me(e) {
      return e.getTime();
    }
    __name(me, "me");
    function he(e, t) {
      return e[t >>> 0];
    }
    __name(he, "he");
    function Te() {
      return g(function(e, t) {
        return e[t];
      }, arguments);
    }
    __name(Te, "Te");
    function Ae() {
      return g(function(e, t) {
        return Reflect.get(e, t);
      }, arguments);
    }
    __name(Ae, "Ae");
    function Se(e, t) {
      return e[t];
    }
    __name(Se, "Se");
    function Fe() {
      return g(function(e, t) {
        return Reflect.has(e, t);
      }, arguments);
    }
    __name(Fe, "Fe");
    function Ie(e) {
      let t;
      try {
        t = e instanceof ArrayBuffer;
      } catch {
        t = false;
      }
      return t;
    }
    __name(Ie, "Ie");
    function qe(e) {
      let t;
      try {
        t = e instanceof Map;
      } catch {
        t = false;
      }
      return t;
    }
    __name(qe, "qe");
    function Ee(e) {
      let t;
      try {
        t = e instanceof Promise;
      } catch {
        t = false;
      }
      return t;
    }
    __name(Ee, "Ee");
    function ke(e) {
      let t;
      try {
        t = e instanceof Uint8Array;
      } catch {
        t = false;
      }
      return t;
    }
    __name(ke, "ke");
    function Oe(e) {
      return Array.isArray(e);
    }
    __name(Oe, "Oe");
    function Me(e) {
      return Number.isSafeInteger(e);
    }
    __name(Me, "Me");
    function ve() {
      return Symbol.iterator;
    }
    __name(ve, "ve");
    function De(e) {
      return Object.keys(e);
    }
    __name(De, "De");
    function Re(e) {
      return e.length;
    }
    __name(Re, "Re");
    function je(e) {
      return e.length;
    }
    __name(je, "je");
    function Be(e) {
      return e.msCrypto;
    }
    __name(Be, "Be");
    function Ue() {
      return /* @__PURE__ */ new Date();
    }
    __name(Ue, "Ue");
    function Le() {
      return new Object();
    }
    __name(Le, "Le");
    function Ne(e, t, n, r) {
      return new RegExp(w(e, t), w(n, r));
    }
    __name(Ne, "Ne");
    function Ce(e, t) {
      try {
        var n = { a: e, b: t }, r = /* @__PURE__ */ __name((i, c) => {
          const u = n.a;
          n.a = 0;
          try {
            return H(u, n.b, i, c);
          } finally {
            n.a = u;
          }
        }, "r");
        return new Promise(r);
      } finally {
        n.a = n.b = 0;
      }
    }
    __name(Ce, "Ce");
    function $e(e) {
      return new Uint8Array(e);
    }
    __name($e, "$e");
    function Ve() {
      return /* @__PURE__ */ new Map();
    }
    __name(Ve, "Ve");
    function We() {
      return new Array();
    }
    __name(We, "We");
    function ze(e, t) {
      return new Uint8Array(E(e, t));
    }
    __name(ze, "ze");
    function Pe(e, t) {
      return new T(w(e, t));
    }
    __name(Pe, "Pe");
    function Ge(e) {
      return new Uint8Array(e >>> 0);
    }
    __name(Ge, "Ge");
    function Qe() {
      return g(function(e) {
        return e.next();
      }, arguments);
    }
    __name(Qe, "Qe");
    function He(e) {
      return e.next;
    }
    __name(He, "He");
    function Je(e) {
      return e.node;
    }
    __name(Je, "Je");
    function Xe() {
      return Date.now();
    }
    __name(Xe, "Xe");
    function Ye(e) {
      return e.now();
    }
    __name(Ye, "Ye");
    function Ke() {
      return g(function() {
        return Date.now();
      }, arguments);
    }
    __name(Ke, "Ke");
    function Ze(e) {
      return e.process;
    }
    __name(Ze, "Ze");
    function et(e, t, n) {
      Uint8Array.prototype.set.call(E(e, t), n);
    }
    __name(et, "et");
    function tt(e, t) {
      return e.push(t);
    }
    __name(tt, "tt");
    function nt(e) {
      return e.queueMicrotask;
    }
    __name(nt, "nt");
    function rt(e) {
      queueMicrotask(e);
    }
    __name(rt, "rt");
    function _t() {
      return g(function(e, t) {
        e.randomFillSync(t);
      }, arguments);
    }
    __name(_t, "_t");
    function ot() {
      return g(function() {
        return module.require;
      }, arguments);
    }
    __name(ot, "ot");
    function ct(e) {
      return Promise.resolve(e);
    }
    __name(ct, "ct");
    function it(e, t) {
      return setTimeout(e, t >>> 0);
    }
    __name(it, "it");
    function ut(e, t, n) {
      e[t] = n;
    }
    __name(ut, "ut");
    function st(e, t, n) {
      return e.set(t, n);
    }
    __name(st, "st");
    function bt(e, t, n) {
      e[t >>> 0] = n;
    }
    __name(bt, "bt");
    function ft() {
      return g(function(e, t, n) {
        return Reflect.set(e, t, n);
      }, arguments);
    }
    __name(ft, "ft");
    function at() {
      const e = typeof global > "u" ? null : global;
      return a(e) ? 0 : x(e);
    }
    __name(at, "at");
    function gt() {
      const e = typeof globalThis > "u" ? null : globalThis;
      return a(e) ? 0 : x(e);
    }
    __name(gt, "gt");
    function lt() {
      const e = typeof self > "u" ? null : self;
      return a(e) ? 0 : x(e);
    }
    __name(lt, "lt");
    function dt() {
      const e = typeof window > "u" ? null : window;
      return a(e) ? 0 : x(e);
    }
    __name(dt, "dt");
    function wt(e, t, n) {
      return e.subarray(t >>> 0, n >>> 0);
    }
    __name(wt, "wt");
    function pt(e, t) {
      return e.then(t);
    }
    __name(pt, "pt");
    function xt(e, t, n) {
      return e.then(t, n);
    }
    __name(xt, "xt");
    function yt(e) {
      return e.valueOf();
    }
    __name(yt, "yt");
    function mt(e) {
      return e.value;
    }
    __name(mt, "mt");
    function ht(e) {
      return e.versions;
    }
    __name(ht, "ht");
    function Tt(e, t) {
      return w(e, t);
    }
    __name(Tt, "Tt");
    function At(e) {
      return BigInt.asUintN(64, e);
    }
    __name(At, "At");
    function St(e, t) {
      return z(e, t, _.wasm_bindgen__closure__destroy__hf9ae564cf31e91c2, Q);
    }
    __name(St, "St");
    function Ft(e) {
      return e;
    }
    __name(Ft, "Ft");
    function It(e, t) {
      return E(e, t);
    }
    __name(It, "It");
    function qt(e) {
      return e;
    }
    __name(qt, "qt");
    function Et() {
      const e = _.__wbindgen_externrefs, t = e.grow(4);
      e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, true), e.set(t + 3, false);
    }
    __name(Et, "Et");
  }
});

// ../node_modules/.prisma/client/wasm-worker-loader.mjs
var wasm_worker_loader_exports = {};
__export(wasm_worker_loader_exports, {
  default: () => wasm_worker_loader_default
});
var wasm_worker_loader_default;
var init_wasm_worker_loader = __esm({
  "../node_modules/.prisma/client/wasm-worker-loader.mjs"() {
    wasm_worker_loader_default = import("./f4b69850bc2f6b02c2a186cea508d821c6b30f98-query_engine_bg.wasm");
  }
});

// ../node_modules/.prisma/client/wasm.js
var require_wasm = __commonJS({
  "../node_modules/.prisma/client/wasm.js"(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var {
      PrismaClientKnownRequestError: PrismaClientKnownRequestError2,
      PrismaClientUnknownRequestError: PrismaClientUnknownRequestError2,
      PrismaClientRustPanicError: PrismaClientRustPanicError2,
      PrismaClientInitializationError: PrismaClientInitializationError2,
      PrismaClientValidationError: PrismaClientValidationError2,
      getPrismaClient: getPrismaClient2,
      sqltag: sqltag2,
      empty: empty2,
      join: join2,
      raw: raw2,
      skip: skip2,
      Decimal: Decimal2,
      Debug: Debug3,
      objectEnumValues: objectEnumValues2,
      makeStrictEnum: makeStrictEnum2,
      Extensions: Extensions2,
      warnOnce: warnOnce2,
      defineDmmfProperty: defineDmmfProperty2,
      Public: Public2,
      getRuntime: getRuntime2,
      createParam: createParam2
    } = require_wasm_engine_edge();
    var Prisma = {};
    exports.Prisma = Prisma;
    exports.$Enums = {};
    Prisma.prismaVersion = {
      client: "6.19.3",
      engine: "c2990dca591cba766e3b7ef5d9e8a84796e47ab7"
    };
    Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError2;
    Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError2;
    Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError2;
    Prisma.PrismaClientInitializationError = PrismaClientInitializationError2;
    Prisma.PrismaClientValidationError = PrismaClientValidationError2;
    Prisma.Decimal = Decimal2;
    Prisma.sql = sqltag2;
    Prisma.empty = empty2;
    Prisma.join = join2;
    Prisma.raw = raw2;
    Prisma.validator = Public2.validator;
    Prisma.getExtensionContext = Extensions2.getExtensionContext;
    Prisma.defineExtension = Extensions2.defineExtension;
    Prisma.DbNull = objectEnumValues2.instances.DbNull;
    Prisma.JsonNull = objectEnumValues2.instances.JsonNull;
    Prisma.AnyNull = objectEnumValues2.instances.AnyNull;
    Prisma.NullTypes = {
      DbNull: objectEnumValues2.classes.DbNull,
      JsonNull: objectEnumValues2.classes.JsonNull,
      AnyNull: objectEnumValues2.classes.AnyNull
    };
    exports.Prisma.TransactionIsolationLevel = makeStrictEnum2({
      ReadUncommitted: "ReadUncommitted",
      ReadCommitted: "ReadCommitted",
      RepeatableRead: "RepeatableRead",
      Serializable: "Serializable"
    });
    exports.Prisma.OrganizationScalarFieldEnum = {
      id: "id",
      slug: "slug",
      name: "name",
      status: "status",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.UserScalarFieldEnum = {
      id: "id",
      email: "email",
      displayName: "displayName",
      passwordHash: "passwordHash",
      status: "status",
      verifiedAt: "verifiedAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.MembershipScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      userId: "userId",
      roleKey: "roleKey",
      status: "status",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.InvitationScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      email: "email",
      roleKey: "roleKey",
      tokenHash: "tokenHash",
      status: "status",
      invitedBy: "invitedBy",
      expiresAt: "expiresAt",
      createdAt: "createdAt",
      acceptedAt: "acceptedAt",
      acceptedUserId: "acceptedUserId",
      revokedAt: "revokedAt"
    };
    exports.Prisma.RolePolicyScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      roleKey: "roleKey",
      permissions: "permissions",
      version: "version",
      updatedBy: "updatedBy",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.SessionScalarFieldEnum = {
      id: "id",
      userId: "userId",
      organizationId: "organizationId",
      tokenVerifierHash: "tokenVerifierHash",
      csrfVerifierHash: "csrfVerifierHash",
      deviceLabel: "deviceLabel",
      userAgent: "userAgent",
      ipHash: "ipHash",
      createdAt: "createdAt",
      lastSeenAt: "lastSeenAt",
      idleExpiresAt: "idleExpiresAt",
      absoluteExpiresAt: "absoluteExpiresAt",
      rotatedFromId: "rotatedFromId",
      revokedAt: "revokedAt",
      revokeReason: "revokeReason"
    };
    exports.Prisma.EmailVerificationScalarFieldEnum = {
      id: "id",
      userId: "userId",
      organizationId: "organizationId",
      email: "email",
      tokenHash: "tokenHash",
      expiresAt: "expiresAt",
      createdAt: "createdAt",
      verifiedAt: "verifiedAt",
      revokedAt: "revokedAt"
    };
    exports.Prisma.WorkspaceHostnameScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      hostname: "hostname",
      kind: "kind",
      status: "status",
      providerRef: "providerRef",
      validationStatus: "validationStatus",
      sslStatus: "sslStatus",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      activatedAt: "activatedAt"
    };
    exports.Prisma.WorkspaceBrandingScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      displayName: "displayName",
      logoObjectRef: "logoObjectRef",
      faviconObjectRef: "faviconObjectRef",
      accentColor: "accentColor",
      footerText: "footerText",
      locale: "locale",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.PlanScalarFieldEnum = {
      id: "id",
      name: "name",
      billingMode: "billingMode",
      capabilities: "capabilities",
      limits: "limits",
      active: "active",
      createdAt: "createdAt"
    };
    exports.Prisma.SubscriptionScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      planId: "planId",
      status: "status",
      providerRef: "providerRef",
      startedAt: "startedAt",
      endsAt: "endsAt"
    };
    exports.Prisma.EntitlementScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      capability: "capability",
      enabled: "enabled",
      source: "source",
      expiresAt: "expiresAt"
    };
    exports.Prisma.UsageLimitScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      key: "key",
      value: "value",
      period: "period",
      used: "used"
    };
    exports.Prisma.NotificationPreferenceScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      userId: "userId",
      eventType: "eventType",
      channel: "channel",
      enabled: "enabled"
    };
    exports.Prisma.NotificationOutboxScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      recipientUserId: "recipientUserId",
      eventType: "eventType",
      channel: "channel",
      payload: "payload",
      idempotencyKey: "idempotencyKey",
      status: "status",
      attempts: "attempts",
      maxAttempts: "maxAttempts",
      nextAttemptAt: "nextAttemptAt",
      lastErrorCode: "lastErrorCode",
      leaseToken: "leaseToken",
      leaseExpiresAt: "leaseExpiresAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.NotificationDeliveryScalarFieldEnum = {
      id: "id",
      outboxId: "outboxId",
      organizationId: "organizationId",
      channel: "channel",
      status: "status",
      attempt: "attempt",
      errorCode: "errorCode",
      attemptedAt: "attemptedAt"
    };
    exports.Prisma.PushSubscriptionScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      userId: "userId",
      endpointHash: "endpointHash",
      endpoint: "endpoint",
      p256dh: "p256dh",
      auth: "auth",
      userAgent: "userAgent",
      revokedAt: "revokedAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
    exports.Prisma.ConsentRecordScalarFieldEnum = {
      id: "id",
      userId: "userId",
      organizationId: "organizationId",
      purpose: "purpose",
      policyVersion: "policyVersion",
      acceptedAt: "acceptedAt",
      withdrawnAt: "withdrawnAt"
    };
    exports.Prisma.PrivacyExportRequestScalarFieldEnum = {
      id: "id",
      userId: "userId",
      organizationId: "organizationId",
      status: "status",
      requestedAt: "requestedAt",
      completedAt: "completedAt",
      artifactRef: "artifactRef"
    };
    exports.Prisma.WorkspaceExportRequestScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      requestedBy: "requestedBy",
      status: "status",
      requestedAt: "requestedAt",
      completedAt: "completedAt",
      artifactRef: "artifactRef"
    };
    exports.Prisma.ErasureReviewRequestScalarFieldEnum = {
      id: "id",
      userId: "userId",
      organizationId: "organizationId",
      status: "status",
      reason: "reason",
      requestedAt: "requestedAt",
      reviewedAt: "reviewedAt"
    };
    exports.Prisma.AuditEventScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      actorUserId: "actorUserId",
      action: "action",
      outcome: "outcome",
      subjectType: "subjectType",
      subjectId: "subjectId",
      correlationId: "correlationId",
      payloadHash: "payloadHash",
      createdAt: "createdAt"
    };
    exports.Prisma.ObservabilitySnapshotScalarFieldEnum = {
      id: "id",
      organizationId: "organizationId",
      apiStatus: "apiStatus",
      databaseStatus: "databaseStatus",
      queueStatus: "queueStatus",
      emailStatus: "emailStatus",
      pushStatus: "pushStatus",
      billingStatus: "billingStatus",
      domainStatus: "domainStatus",
      degradedCount: "degradedCount",
      capturedAt: "capturedAt"
    };
    exports.Prisma.SortOrder = {
      asc: "asc",
      desc: "desc"
    };
    exports.Prisma.JsonNullValueInput = {
      JsonNull: Prisma.JsonNull
    };
    exports.Prisma.QueryMode = {
      default: "default",
      insensitive: "insensitive"
    };
    exports.Prisma.NullsOrder = {
      first: "first",
      last: "last"
    };
    exports.Prisma.JsonNullValueFilter = {
      DbNull: Prisma.DbNull,
      JsonNull: Prisma.JsonNull,
      AnyNull: Prisma.AnyNull
    };
    exports.Prisma.ModelName = {
      Organization: "Organization",
      User: "User",
      Membership: "Membership",
      Invitation: "Invitation",
      RolePolicy: "RolePolicy",
      Session: "Session",
      EmailVerification: "EmailVerification",
      WorkspaceHostname: "WorkspaceHostname",
      WorkspaceBranding: "WorkspaceBranding",
      Plan: "Plan",
      Subscription: "Subscription",
      Entitlement: "Entitlement",
      UsageLimit: "UsageLimit",
      NotificationPreference: "NotificationPreference",
      NotificationOutbox: "NotificationOutbox",
      NotificationDelivery: "NotificationDelivery",
      PushSubscription: "PushSubscription",
      ConsentRecord: "ConsentRecord",
      PrivacyExportRequest: "PrivacyExportRequest",
      WorkspaceExportRequest: "WorkspaceExportRequest",
      ErasureReviewRequest: "ErasureReviewRequest",
      AuditEvent: "AuditEvent",
      ObservabilitySnapshot: "ObservabilitySnapshot"
    };
    var config = {
      "generator": {
        "name": "client",
        "provider": {
          "fromEnvVar": null,
          "value": "prisma-client-js"
        },
        "output": {
          "value": "C:\\Users\\TUYEN\\Documents\\OlfactoryOps-runtime-path-diagnostic\\node_modules\\@prisma\\client",
          "fromEnvVar": null
        },
        "config": {
          "runtime": "workerd",
          "engineType": "library"
        },
        "binaryTargets": [
          {
            "fromEnvVar": null,
            "value": "windows",
            "native": true
          }
        ],
        "previewFeatures": [],
        "sourceFilePath": "C:\\Users\\TUYEN\\Documents\\OlfactoryOps-runtime-path-diagnostic\\infra\\postgres\\prisma\\schema.prisma"
      },
      "relativeEnvPaths": {
        "rootEnvPath": null
      },
      "relativePath": "../../../infra/postgres/prisma",
      "clientVersion": "6.19.3",
      "engineVersion": "c2990dca591cba766e3b7ef5d9e8a84796e47ab7",
      "datasourceNames": [
        "db"
      ],
      "activeProvider": "postgresql",
      "postinstall": false,
      "inlineDatasources": {
        "db": {
          "url": {
            "fromEnvVar": "DATABASE_URL",
            "value": null
          }
        }
      },
      "inlineSchema": 'generator client {\n  provider = "prisma-client-js"\n  runtime  = "workerd"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\nmodel Organization {\n  id                      String                   @id @default(cuid())\n  slug                    String                   @unique\n  name                    String\n  status                  String                   @default("ACTIVE")\n  createdAt               DateTime                 @default(now()) @map("created_at")\n  updatedAt               DateTime                 @updatedAt @map("updated_at")\n  memberships             Membership[]\n  invitations             Invitation[]\n  hostnames               WorkspaceHostname[]\n  branding                WorkspaceBranding?\n  plans                   Subscription[]\n  policies                RolePolicy[]\n  entitlements            Entitlement[]\n  usageLimits             UsageLimit[]\n  notificationPreferences NotificationPreference[]\n  notifications           NotificationOutbox[]\n  notificationDeliveries  NotificationDelivery[]\n  pushSubscriptions       PushSubscription[]\n  consents                ConsentRecord[]\n  privacyExports          PrivacyExportRequest[]\n  workspaceExports        WorkspaceExportRequest[]\n  erasureReviews          ErasureReviewRequest[]\n  auditEvents             AuditEvent[]\n  observabilitySnapshots  ObservabilitySnapshot[]\n\n  @@map("v2_organizations")\n}\n\nmodel User {\n  id                      String                   @id @default(cuid())\n  email                   String                   @unique\n  displayName             String                   @map("display_name")\n  passwordHash            String                   @map("password_hash")\n  status                  String                   @default("ACTIVE")\n  verifiedAt              DateTime?                @map("verified_at")\n  createdAt               DateTime                 @default(now()) @map("created_at")\n  updatedAt               DateTime                 @updatedAt @map("updated_at")\n  memberships             Membership[]\n  sessions                Session[]\n  verifications           EmailVerification[]\n  sentInvitations         Invitation[]             @relation("InvitationSender")\n  consents                ConsentRecord[]\n  pushSubscriptions       PushSubscription[]\n  notificationPreferences NotificationPreference[]\n  privacyExports          PrivacyExportRequest[]\n  erasureReviews          ErasureReviewRequest[]\n\n  @@map("v2_users")\n}\n\nmodel Membership {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  userId         String       @map("user_id")\n  roleKey        String       @map("role_key")\n  status         String       @default("ACTIVE")\n  createdAt      DateTime     @default(now()) @map("created_at")\n  updatedAt      DateTime     @updatedAt @map("updated_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, userId])\n  @@index([userId, status])\n  @@index([organizationId, status])\n  @@map("v2_memberships")\n}\n\nmodel Invitation {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  email          String\n  roleKey        String       @map("role_key")\n  tokenHash      String       @unique @map("token_hash")\n  status         String       @default("PENDING")\n  invitedBy      String       @map("invited_by")\n  expiresAt      DateTime     @map("expires_at")\n  createdAt      DateTime     @default(now()) @map("created_at")\n  acceptedAt     DateTime?    @map("accepted_at")\n  acceptedUserId String?      @map("accepted_user_id")\n  revokedAt      DateTime?    @map("revoked_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  inviter        User         @relation("InvitationSender", fields: [invitedBy], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, status, email])\n  @@index([tokenHash, status])\n  @@map("v2_invitations")\n}\n\nmodel RolePolicy {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  roleKey        String       @map("role_key")\n  permissions    Json\n  version        Int          @default(1)\n  updatedBy      String       @map("updated_by")\n  createdAt      DateTime     @default(now()) @map("created_at")\n  updatedAt      DateTime     @updatedAt @map("updated_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, roleKey])\n  @@map("v2_role_policies")\n}\n\nmodel Session {\n  id                String    @id @default(cuid())\n  userId            String    @map("user_id")\n  organizationId    String    @map("organization_id")\n  tokenVerifierHash String    @unique @map("token_verifier_hash")\n  csrfVerifierHash  String    @map("csrf_verifier_hash")\n  deviceLabel       String?   @map("device_label")\n  userAgent         String?   @map("user_agent")\n  ipHash            String?   @map("ip_hash")\n  createdAt         DateTime  @default(now()) @map("created_at")\n  lastSeenAt        DateTime  @default(now()) @map("last_seen_at")\n  idleExpiresAt     DateTime  @map("idle_expires_at")\n  absoluteExpiresAt DateTime  @map("absolute_expires_at")\n  rotatedFromId     String?   @map("rotated_from_id")\n  revokedAt         DateTime? @map("revoked_at")\n  revokeReason      String?   @map("revoke_reason")\n  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@index([userId, revokedAt])\n  @@index([organizationId, revokedAt])\n  @@map("v2_sessions")\n}\n\nmodel EmailVerification {\n  id             String    @id @default(cuid())\n  userId         String    @map("user_id")\n  organizationId String    @map("organization_id")\n  email          String\n  tokenHash      String    @unique @map("token_hash")\n  expiresAt      DateTime  @map("expires_at")\n  createdAt      DateTime  @default(now()) @map("created_at")\n  verifiedAt     DateTime? @map("verified_at")\n  revokedAt      DateTime? @map("revoked_at")\n  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@index([userId, revokedAt, expiresAt])\n  @@map("v2_email_verifications")\n}\n\nmodel WorkspaceHostname {\n  id               String       @id @default(cuid())\n  organizationId   String       @map("organization_id")\n  hostname         String       @unique\n  kind             String       @default("DEFAULT")\n  status           String       @default("PENDING")\n  providerRef      String?      @map("provider_ref")\n  validationStatus String?      @map("validation_status")\n  sslStatus        String?      @map("ssl_status")\n  createdAt        DateTime     @default(now()) @map("created_at")\n  updatedAt        DateTime     @updatedAt @map("updated_at")\n  activatedAt      DateTime?    @map("activated_at")\n  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, status])\n  @@map("v2_workspace_hostnames")\n}\n\nmodel WorkspaceBranding {\n  id               String       @id @default(cuid())\n  organizationId   String       @unique @map("organization_id")\n  displayName      String       @map("display_name")\n  logoObjectRef    String?      @map("logo_object_ref")\n  faviconObjectRef String?      @map("favicon_object_ref")\n  accentColor      String?      @map("accent_color")\n  footerText       String?      @map("footer_text")\n  locale           String       @default("en-US")\n  createdAt        DateTime     @default(now()) @map("created_at")\n  updatedAt        DateTime     @updatedAt @map("updated_at")\n  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@map("v2_workspace_branding")\n}\n\nmodel Plan {\n  id            String         @id\n  name          String\n  billingMode   String         @map("billing_mode")\n  capabilities  Json\n  limits        Json\n  active        Boolean        @default(true)\n  createdAt     DateTime       @default(now()) @map("created_at")\n  subscriptions Subscription[]\n\n  @@map("v2_plans")\n}\n\nmodel Subscription {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  planId         String       @map("plan_id")\n  status         String       @default("MANAGED_BETA")\n  providerRef    String?      @map("provider_ref")\n  startedAt      DateTime     @default(now()) @map("started_at")\n  endsAt         DateTime?    @map("ends_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  plan           Plan         @relation(fields: [planId], references: [id])\n\n  @@index([organizationId, status])\n  @@map("v2_subscriptions")\n}\n\nmodel Entitlement {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  capability     String\n  enabled        Boolean      @default(false)\n  source         String       @default("MANAGED_BETA")\n  expiresAt      DateTime?    @map("expires_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, capability])\n  @@map("v2_entitlements")\n}\n\nmodel UsageLimit {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  key            String\n  value          Int\n  period         String       @default("LIFETIME")\n  used           Int          @default(0)\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, key, period])\n  @@map("v2_usage_limits")\n}\n\nmodel NotificationPreference {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  userId         String       @map("user_id")\n  eventType      String       @map("event_type")\n  channel        String\n  enabled        Boolean      @default(true)\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, userId, eventType, channel])\n  @@map("v2_notification_preferences")\n}\n\nmodel NotificationOutbox {\n  id              String       @id @default(cuid())\n  organizationId  String       @map("organization_id")\n  recipientUserId String?      @map("recipient_user_id")\n  eventType       String       @map("event_type")\n  channel         String\n  payload         Json\n  idempotencyKey  String       @map("idempotency_key")\n  status          String       @default("QUEUED")\n  attempts        Int          @default(0)\n  maxAttempts     Int          @default(5) @map("max_attempts")\n  nextAttemptAt   DateTime     @default(now()) @map("next_attempt_at")\n  lastErrorCode   String?      @map("last_error_code")\n  leaseToken      String?      @map("lease_token")\n  leaseExpiresAt  DateTime?    @map("lease_expires_at")\n  createdAt       DateTime     @default(now()) @map("created_at")\n  updatedAt       DateTime     @updatedAt @map("updated_at")\n  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, idempotencyKey, channel])\n  @@index([status, nextAttemptAt])\n  @@index([organizationId, status, nextAttemptAt])\n  @@map("v2_notification_outbox")\n}\n\nmodel NotificationDelivery {\n  id             String       @id @default(cuid())\n  outboxId       String       @map("outbox_id")\n  organizationId String       @map("organization_id")\n  channel        String\n  status         String\n  attempt        Int\n  errorCode      String?      @map("error_code")\n  attemptedAt    DateTime     @default(now()) @map("attempted_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([outboxId, attempt])\n  @@index([organizationId, outboxId])\n  @@map("v2_notification_deliveries")\n}\n\nmodel PushSubscription {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  userId         String       @map("user_id")\n  endpointHash   String       @map("endpoint_hash")\n  endpoint       String\n  p256dh         String\n  auth           String\n  userAgent      String?      @map("user_agent")\n  revokedAt      DateTime?    @map("revoked_at")\n  createdAt      DateTime     @default(now()) @map("created_at")\n  updatedAt      DateTime     @updatedAt @map("updated_at")\n  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, endpointHash])\n  @@map("v2_push_subscriptions")\n}\n\nmodel ConsentRecord {\n  id             String        @id @default(cuid())\n  userId         String        @map("user_id")\n  organizationId String?       @map("organization_id")\n  purpose        String\n  policyVersion  String        @map("policy_version")\n  acceptedAt     DateTime      @map("accepted_at")\n  withdrawnAt    DateTime?     @map("withdrawn_at")\n  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)\n  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([userId, purpose, acceptedAt])\n  @@map("v2_consent_records")\n}\n\nmodel PrivacyExportRequest {\n  id             String        @id @default(cuid())\n  userId         String        @map("user_id")\n  organizationId String?       @map("organization_id")\n  status         String        @default("REQUESTED")\n  requestedAt    DateTime      @default(now()) @map("requested_at")\n  completedAt    DateTime?     @map("completed_at")\n  artifactRef    String?       @map("artifact_ref")\n  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)\n  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([userId, status])\n  @@map("v2_privacy_export_requests")\n}\n\nmodel WorkspaceExportRequest {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  requestedBy    String       @map("requested_by")\n  status         String       @default("REQUESTED")\n  requestedAt    DateTime     @default(now()) @map("requested_at")\n  completedAt    DateTime?    @map("completed_at")\n  artifactRef    String?      @map("artifact_ref")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, status])\n  @@map("v2_workspace_export_requests")\n}\n\nmodel ErasureReviewRequest {\n  id             String        @id @default(cuid())\n  userId         String        @map("user_id")\n  organizationId String?       @map("organization_id")\n  status         String        @default("REVIEW_REQUIRED")\n  reason         String?\n  requestedAt    DateTime      @default(now()) @map("requested_at")\n  reviewedAt     DateTime?     @map("reviewed_at")\n  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)\n  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@map("v2_erasure_review_requests")\n}\n\nmodel AuditEvent {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  actorUserId    String?      @map("actor_user_id")\n  action         String\n  outcome        String\n  subjectType    String       @map("subject_type")\n  subjectId      String       @map("subject_id")\n  correlationId  String       @map("correlation_id")\n  payloadHash    String?      @map("payload_hash")\n  createdAt      DateTime     @default(now()) @map("created_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, createdAt])\n  @@index([organizationId, action])\n  @@map("v2_audit_events")\n}\n\nmodel ObservabilitySnapshot {\n  id             String       @id @default(cuid())\n  organizationId String       @map("organization_id")\n  apiStatus      String       @map("api_status")\n  databaseStatus String       @map("database_status")\n  queueStatus    String       @map("queue_status")\n  emailStatus    String       @map("email_status")\n  pushStatus     String       @map("push_status")\n  billingStatus  String       @map("billing_status")\n  domainStatus   String       @map("domain_status")\n  degradedCount  Int          @default(0) @map("degraded_count")\n  capturedAt     DateTime     @default(now()) @map("captured_at")\n  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, capturedAt])\n  @@map("v2_observability_snapshots")\n}\n',
      "inlineSchemaHash": "170d622459b25e5bf34e184ff979424e1dcd0ec883a6c12846bc4dcadc014ee4",
      "copyEngine": true
    };
    config.dirname = "/";
    config.runtimeDataModel = JSON.parse('{"models":{"Organization":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"memberships","kind":"object","type":"Membership","relationName":"MembershipToOrganization"},{"name":"invitations","kind":"object","type":"Invitation","relationName":"InvitationToOrganization"},{"name":"hostnames","kind":"object","type":"WorkspaceHostname","relationName":"OrganizationToWorkspaceHostname"},{"name":"branding","kind":"object","type":"WorkspaceBranding","relationName":"OrganizationToWorkspaceBranding"},{"name":"plans","kind":"object","type":"Subscription","relationName":"OrganizationToSubscription"},{"name":"policies","kind":"object","type":"RolePolicy","relationName":"OrganizationToRolePolicy"},{"name":"entitlements","kind":"object","type":"Entitlement","relationName":"EntitlementToOrganization"},{"name":"usageLimits","kind":"object","type":"UsageLimit","relationName":"OrganizationToUsageLimit"},{"name":"notificationPreferences","kind":"object","type":"NotificationPreference","relationName":"NotificationPreferenceToOrganization"},{"name":"notifications","kind":"object","type":"NotificationOutbox","relationName":"NotificationOutboxToOrganization"},{"name":"notificationDeliveries","kind":"object","type":"NotificationDelivery","relationName":"NotificationDeliveryToOrganization"},{"name":"pushSubscriptions","kind":"object","type":"PushSubscription","relationName":"OrganizationToPushSubscription"},{"name":"consents","kind":"object","type":"ConsentRecord","relationName":"ConsentRecordToOrganization"},{"name":"privacyExports","kind":"object","type":"PrivacyExportRequest","relationName":"OrganizationToPrivacyExportRequest"},{"name":"workspaceExports","kind":"object","type":"WorkspaceExportRequest","relationName":"OrganizationToWorkspaceExportRequest"},{"name":"erasureReviews","kind":"object","type":"ErasureReviewRequest","relationName":"ErasureReviewRequestToOrganization"},{"name":"auditEvents","kind":"object","type":"AuditEvent","relationName":"AuditEventToOrganization"},{"name":"observabilitySnapshots","kind":"object","type":"ObservabilitySnapshot","relationName":"ObservabilitySnapshotToOrganization"}],"dbName":"v2_organizations"},"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"displayName","kind":"scalar","type":"String","dbName":"display_name"},{"name":"passwordHash","kind":"scalar","type":"String","dbName":"password_hash"},{"name":"status","kind":"scalar","type":"String"},{"name":"verifiedAt","kind":"scalar","type":"DateTime","dbName":"verified_at"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"memberships","kind":"object","type":"Membership","relationName":"MembershipToUser"},{"name":"sessions","kind":"object","type":"Session","relationName":"SessionToUser"},{"name":"verifications","kind":"object","type":"EmailVerification","relationName":"EmailVerificationToUser"},{"name":"sentInvitations","kind":"object","type":"Invitation","relationName":"InvitationSender"},{"name":"consents","kind":"object","type":"ConsentRecord","relationName":"ConsentRecordToUser"},{"name":"pushSubscriptions","kind":"object","type":"PushSubscription","relationName":"PushSubscriptionToUser"},{"name":"notificationPreferences","kind":"object","type":"NotificationPreference","relationName":"NotificationPreferenceToUser"},{"name":"privacyExports","kind":"object","type":"PrivacyExportRequest","relationName":"PrivacyExportRequestToUser"},{"name":"erasureReviews","kind":"object","type":"ErasureReviewRequest","relationName":"ErasureReviewRequestToUser"}],"dbName":"v2_users"},"Membership":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"roleKey","kind":"scalar","type":"String","dbName":"role_key"},{"name":"status","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"MembershipToOrganization"},{"name":"user","kind":"object","type":"User","relationName":"MembershipToUser"}],"dbName":"v2_memberships"},"Invitation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"email","kind":"scalar","type":"String"},{"name":"roleKey","kind":"scalar","type":"String","dbName":"role_key"},{"name":"tokenHash","kind":"scalar","type":"String","dbName":"token_hash"},{"name":"status","kind":"scalar","type":"String"},{"name":"invitedBy","kind":"scalar","type":"String","dbName":"invited_by"},{"name":"expiresAt","kind":"scalar","type":"DateTime","dbName":"expires_at"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"acceptedAt","kind":"scalar","type":"DateTime","dbName":"accepted_at"},{"name":"acceptedUserId","kind":"scalar","type":"String","dbName":"accepted_user_id"},{"name":"revokedAt","kind":"scalar","type":"DateTime","dbName":"revoked_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"InvitationToOrganization"},{"name":"inviter","kind":"object","type":"User","relationName":"InvitationSender"}],"dbName":"v2_invitations"},"RolePolicy":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"roleKey","kind":"scalar","type":"String","dbName":"role_key"},{"name":"permissions","kind":"scalar","type":"Json"},{"name":"version","kind":"scalar","type":"Int"},{"name":"updatedBy","kind":"scalar","type":"String","dbName":"updated_by"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToRolePolicy"}],"dbName":"v2_role_policies"},"Session":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"tokenVerifierHash","kind":"scalar","type":"String","dbName":"token_verifier_hash"},{"name":"csrfVerifierHash","kind":"scalar","type":"String","dbName":"csrf_verifier_hash"},{"name":"deviceLabel","kind":"scalar","type":"String","dbName":"device_label"},{"name":"userAgent","kind":"scalar","type":"String","dbName":"user_agent"},{"name":"ipHash","kind":"scalar","type":"String","dbName":"ip_hash"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime","dbName":"last_seen_at"},{"name":"idleExpiresAt","kind":"scalar","type":"DateTime","dbName":"idle_expires_at"},{"name":"absoluteExpiresAt","kind":"scalar","type":"DateTime","dbName":"absolute_expires_at"},{"name":"rotatedFromId","kind":"scalar","type":"String","dbName":"rotated_from_id"},{"name":"revokedAt","kind":"scalar","type":"DateTime","dbName":"revoked_at"},{"name":"revokeReason","kind":"scalar","type":"String","dbName":"revoke_reason"},{"name":"user","kind":"object","type":"User","relationName":"SessionToUser"}],"dbName":"v2_sessions"},"EmailVerification":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"email","kind":"scalar","type":"String"},{"name":"tokenHash","kind":"scalar","type":"String","dbName":"token_hash"},{"name":"expiresAt","kind":"scalar","type":"DateTime","dbName":"expires_at"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"verifiedAt","kind":"scalar","type":"DateTime","dbName":"verified_at"},{"name":"revokedAt","kind":"scalar","type":"DateTime","dbName":"revoked_at"},{"name":"user","kind":"object","type":"User","relationName":"EmailVerificationToUser"}],"dbName":"v2_email_verifications"},"WorkspaceHostname":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"hostname","kind":"scalar","type":"String"},{"name":"kind","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"providerRef","kind":"scalar","type":"String","dbName":"provider_ref"},{"name":"validationStatus","kind":"scalar","type":"String","dbName":"validation_status"},{"name":"sslStatus","kind":"scalar","type":"String","dbName":"ssl_status"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"activatedAt","kind":"scalar","type":"DateTime","dbName":"activated_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWorkspaceHostname"}],"dbName":"v2_workspace_hostnames"},"WorkspaceBranding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"displayName","kind":"scalar","type":"String","dbName":"display_name"},{"name":"logoObjectRef","kind":"scalar","type":"String","dbName":"logo_object_ref"},{"name":"faviconObjectRef","kind":"scalar","type":"String","dbName":"favicon_object_ref"},{"name":"accentColor","kind":"scalar","type":"String","dbName":"accent_color"},{"name":"footerText","kind":"scalar","type":"String","dbName":"footer_text"},{"name":"locale","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWorkspaceBranding"}],"dbName":"v2_workspace_branding"},"Plan":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"billingMode","kind":"scalar","type":"String","dbName":"billing_mode"},{"name":"capabilities","kind":"scalar","type":"Json"},{"name":"limits","kind":"scalar","type":"Json"},{"name":"active","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"subscriptions","kind":"object","type":"Subscription","relationName":"PlanToSubscription"}],"dbName":"v2_plans"},"Subscription":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"planId","kind":"scalar","type":"String","dbName":"plan_id"},{"name":"status","kind":"scalar","type":"String"},{"name":"providerRef","kind":"scalar","type":"String","dbName":"provider_ref"},{"name":"startedAt","kind":"scalar","type":"DateTime","dbName":"started_at"},{"name":"endsAt","kind":"scalar","type":"DateTime","dbName":"ends_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToSubscription"},{"name":"plan","kind":"object","type":"Plan","relationName":"PlanToSubscription"}],"dbName":"v2_subscriptions"},"Entitlement":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"capability","kind":"scalar","type":"String"},{"name":"enabled","kind":"scalar","type":"Boolean"},{"name":"source","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime","dbName":"expires_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"EntitlementToOrganization"}],"dbName":"v2_entitlements"},"UsageLimit":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"key","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"Int"},{"name":"period","kind":"scalar","type":"String"},{"name":"used","kind":"scalar","type":"Int"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToUsageLimit"}],"dbName":"v2_usage_limits"},"NotificationPreference":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"eventType","kind":"scalar","type":"String","dbName":"event_type"},{"name":"channel","kind":"scalar","type":"String"},{"name":"enabled","kind":"scalar","type":"Boolean"},{"name":"organization","kind":"object","type":"Organization","relationName":"NotificationPreferenceToOrganization"},{"name":"user","kind":"object","type":"User","relationName":"NotificationPreferenceToUser"}],"dbName":"v2_notification_preferences"},"NotificationOutbox":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"recipientUserId","kind":"scalar","type":"String","dbName":"recipient_user_id"},{"name":"eventType","kind":"scalar","type":"String","dbName":"event_type"},{"name":"channel","kind":"scalar","type":"String"},{"name":"payload","kind":"scalar","type":"Json"},{"name":"idempotencyKey","kind":"scalar","type":"String","dbName":"idempotency_key"},{"name":"status","kind":"scalar","type":"String"},{"name":"attempts","kind":"scalar","type":"Int"},{"name":"maxAttempts","kind":"scalar","type":"Int","dbName":"max_attempts"},{"name":"nextAttemptAt","kind":"scalar","type":"DateTime","dbName":"next_attempt_at"},{"name":"lastErrorCode","kind":"scalar","type":"String","dbName":"last_error_code"},{"name":"leaseToken","kind":"scalar","type":"String","dbName":"lease_token"},{"name":"leaseExpiresAt","kind":"scalar","type":"DateTime","dbName":"lease_expires_at"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"NotificationOutboxToOrganization"}],"dbName":"v2_notification_outbox"},"NotificationDelivery":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"outboxId","kind":"scalar","type":"String","dbName":"outbox_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"channel","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"attempt","kind":"scalar","type":"Int"},{"name":"errorCode","kind":"scalar","type":"String","dbName":"error_code"},{"name":"attemptedAt","kind":"scalar","type":"DateTime","dbName":"attempted_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"NotificationDeliveryToOrganization"}],"dbName":"v2_notification_deliveries"},"PushSubscription":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"endpointHash","kind":"scalar","type":"String","dbName":"endpoint_hash"},{"name":"endpoint","kind":"scalar","type":"String"},{"name":"p256dh","kind":"scalar","type":"String"},{"name":"auth","kind":"scalar","type":"String"},{"name":"userAgent","kind":"scalar","type":"String","dbName":"user_agent"},{"name":"revokedAt","kind":"scalar","type":"DateTime","dbName":"revoked_at"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"updatedAt","kind":"scalar","type":"DateTime","dbName":"updated_at"},{"name":"user","kind":"object","type":"User","relationName":"PushSubscriptionToUser"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToPushSubscription"}],"dbName":"v2_push_subscriptions"},"ConsentRecord":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"purpose","kind":"scalar","type":"String"},{"name":"policyVersion","kind":"scalar","type":"String","dbName":"policy_version"},{"name":"acceptedAt","kind":"scalar","type":"DateTime","dbName":"accepted_at"},{"name":"withdrawnAt","kind":"scalar","type":"DateTime","dbName":"withdrawn_at"},{"name":"user","kind":"object","type":"User","relationName":"ConsentRecordToUser"},{"name":"organization","kind":"object","type":"Organization","relationName":"ConsentRecordToOrganization"}],"dbName":"v2_consent_records"},"PrivacyExportRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"status","kind":"scalar","type":"String"},{"name":"requestedAt","kind":"scalar","type":"DateTime","dbName":"requested_at"},{"name":"completedAt","kind":"scalar","type":"DateTime","dbName":"completed_at"},{"name":"artifactRef","kind":"scalar","type":"String","dbName":"artifact_ref"},{"name":"user","kind":"object","type":"User","relationName":"PrivacyExportRequestToUser"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToPrivacyExportRequest"}],"dbName":"v2_privacy_export_requests"},"WorkspaceExportRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"requestedBy","kind":"scalar","type":"String","dbName":"requested_by"},{"name":"status","kind":"scalar","type":"String"},{"name":"requestedAt","kind":"scalar","type":"DateTime","dbName":"requested_at"},{"name":"completedAt","kind":"scalar","type":"DateTime","dbName":"completed_at"},{"name":"artifactRef","kind":"scalar","type":"String","dbName":"artifact_ref"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWorkspaceExportRequest"}],"dbName":"v2_workspace_export_requests"},"ErasureReviewRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String","dbName":"user_id"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"status","kind":"scalar","type":"String"},{"name":"reason","kind":"scalar","type":"String"},{"name":"requestedAt","kind":"scalar","type":"DateTime","dbName":"requested_at"},{"name":"reviewedAt","kind":"scalar","type":"DateTime","dbName":"reviewed_at"},{"name":"user","kind":"object","type":"User","relationName":"ErasureReviewRequestToUser"},{"name":"organization","kind":"object","type":"Organization","relationName":"ErasureReviewRequestToOrganization"}],"dbName":"v2_erasure_review_requests"},"AuditEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"actorUserId","kind":"scalar","type":"String","dbName":"actor_user_id"},{"name":"action","kind":"scalar","type":"String"},{"name":"outcome","kind":"scalar","type":"String"},{"name":"subjectType","kind":"scalar","type":"String","dbName":"subject_type"},{"name":"subjectId","kind":"scalar","type":"String","dbName":"subject_id"},{"name":"correlationId","kind":"scalar","type":"String","dbName":"correlation_id"},{"name":"payloadHash","kind":"scalar","type":"String","dbName":"payload_hash"},{"name":"createdAt","kind":"scalar","type":"DateTime","dbName":"created_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"AuditEventToOrganization"}],"dbName":"v2_audit_events"},"ObservabilitySnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String","dbName":"organization_id"},{"name":"apiStatus","kind":"scalar","type":"String","dbName":"api_status"},{"name":"databaseStatus","kind":"scalar","type":"String","dbName":"database_status"},{"name":"queueStatus","kind":"scalar","type":"String","dbName":"queue_status"},{"name":"emailStatus","kind":"scalar","type":"String","dbName":"email_status"},{"name":"pushStatus","kind":"scalar","type":"String","dbName":"push_status"},{"name":"billingStatus","kind":"scalar","type":"String","dbName":"billing_status"},{"name":"domainStatus","kind":"scalar","type":"String","dbName":"domain_status"},{"name":"degradedCount","kind":"scalar","type":"Int","dbName":"degraded_count"},{"name":"capturedAt","kind":"scalar","type":"DateTime","dbName":"captured_at"},{"name":"organization","kind":"object","type":"Organization","relationName":"ObservabilitySnapshotToOrganization"}],"dbName":"v2_observability_snapshots"}},"enums":{},"types":{}}');
    defineDmmfProperty2(exports.Prisma, config.runtimeDataModel);
    config.engineWasm = {
      getRuntime: /* @__PURE__ */ __name(async () => require_query_engine_bg(), "getRuntime"),
      getQueryEngineWasmModule: /* @__PURE__ */ __name(async () => {
        const loader = (await Promise.resolve().then(() => (init_wasm_worker_loader(), wasm_worker_loader_exports))).default;
        const engine = (await loader).default;
        return engine;
      }, "getQueryEngineWasmModule")
    };
    config.compilerWasm = void 0;
    config.injectableEdgeEnv = () => ({
      parsed: {
        DATABASE_URL: typeof globalThis !== "undefined" && globalThis["DATABASE_URL"] || typeof process !== "undefined" && process.env && process.env.DATABASE_URL || void 0
      }
    });
    if (typeof globalThis !== "undefined" && globalThis["DEBUG"] || typeof process !== "undefined" && process.env && process.env.DEBUG || void 0) {
      Debug3.enable(typeof globalThis !== "undefined" && globalThis["DEBUG"] || typeof process !== "undefined" && process.env && process.env.DEBUG || void 0);
    }
    var PrismaClient2 = getPrismaClient2(config);
    exports.PrismaClient = PrismaClient2;
    Object.assign(exports, Prisma);
  }
});

// ../node_modules/.prisma/client/default.js
var require_default = __commonJS({
  "../node_modules/.prisma/client/default.js"(exports, module) {
    module.exports = { ...require_wasm() };
  }
});

// ../node_modules/@prisma/client/default.js
var require_default2 = __commonJS({
  "../node_modules/@prisma/client/default.js"(exports, module) {
    module.exports = {
      ...require_default()
    };
  }
});

// ../node_modules/@prisma/debug/dist/index.mjs
var __defProp2 = Object.defineProperty;
var __export2 = /* @__PURE__ */ __name((target, all) => {
  for (var name2 in all)
    __defProp2(target, name2, { get: all[name2], enumerable: true });
}, "__export");
var colors_exports = {};
__export2(colors_exports, {
  $: /* @__PURE__ */ __name(() => $, "$"),
  bgBlack: /* @__PURE__ */ __name(() => bgBlack, "bgBlack"),
  bgBlue: /* @__PURE__ */ __name(() => bgBlue, "bgBlue"),
  bgCyan: /* @__PURE__ */ __name(() => bgCyan, "bgCyan"),
  bgGreen: /* @__PURE__ */ __name(() => bgGreen, "bgGreen"),
  bgMagenta: /* @__PURE__ */ __name(() => bgMagenta, "bgMagenta"),
  bgRed: /* @__PURE__ */ __name(() => bgRed, "bgRed"),
  bgWhite: /* @__PURE__ */ __name(() => bgWhite, "bgWhite"),
  bgYellow: /* @__PURE__ */ __name(() => bgYellow, "bgYellow"),
  black: /* @__PURE__ */ __name(() => black, "black"),
  blue: /* @__PURE__ */ __name(() => blue, "blue"),
  bold: /* @__PURE__ */ __name(() => bold, "bold"),
  cyan: /* @__PURE__ */ __name(() => cyan, "cyan"),
  dim: /* @__PURE__ */ __name(() => dim, "dim"),
  gray: /* @__PURE__ */ __name(() => gray, "gray"),
  green: /* @__PURE__ */ __name(() => green, "green"),
  grey: /* @__PURE__ */ __name(() => grey, "grey"),
  hidden: /* @__PURE__ */ __name(() => hidden, "hidden"),
  inverse: /* @__PURE__ */ __name(() => inverse, "inverse"),
  italic: /* @__PURE__ */ __name(() => italic, "italic"),
  magenta: /* @__PURE__ */ __name(() => magenta, "magenta"),
  red: /* @__PURE__ */ __name(() => red, "red"),
  reset: /* @__PURE__ */ __name(() => reset, "reset"),
  strikethrough: /* @__PURE__ */ __name(() => strikethrough, "strikethrough"),
  underline: /* @__PURE__ */ __name(() => underline, "underline"),
  white: /* @__PURE__ */ __name(() => white, "white"),
  yellow: /* @__PURE__ */ __name(() => yellow, "yellow")
});
var FORCE_COLOR;
var NODE_DISABLE_COLORS;
var NO_COLOR;
var TERM;
var isTTY = true;
if (typeof process !== "undefined") {
  ({ FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM } = process.env || {});
  isTTY = process.stdout && process.stdout.isTTY;
}
var $ = {
  enabled: !NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== "dumb" && (FORCE_COLOR != null && FORCE_COLOR !== "0" || isTTY)
};
function init(x, y) {
  let rgx = new RegExp(`\\x1b\\[${y}m`, "g");
  let open = `\x1B[${x}m`, close = `\x1B[${y}m`;
  return function(txt) {
    if (!$.enabled || txt == null) return txt;
    return open + (!!~("" + txt).indexOf(close) ? txt.replace(rgx, close + open) : txt) + close;
  };
}
__name(init, "init");
var reset = init(0, 0);
var bold = init(1, 22);
var dim = init(2, 22);
var italic = init(3, 23);
var underline = init(4, 24);
var inverse = init(7, 27);
var hidden = init(8, 28);
var strikethrough = init(9, 29);
var black = init(30, 39);
var red = init(31, 39);
var green = init(32, 39);
var yellow = init(33, 39);
var blue = init(34, 39);
var magenta = init(35, 39);
var cyan = init(36, 39);
var white = init(37, 39);
var gray = init(90, 39);
var grey = init(90, 39);
var bgBlack = init(40, 49);
var bgRed = init(41, 49);
var bgGreen = init(42, 49);
var bgYellow = init(43, 49);
var bgBlue = init(44, 49);
var bgMagenta = init(45, 49);
var bgCyan = init(46, 49);
var bgWhite = init(47, 49);
var MAX_ARGS_HISTORY = 100;
var COLORS = ["green", "yellow", "blue", "magenta", "cyan", "red"];
var argsHistory = [];
var lastTimestamp = Date.now();
var lastColor = 0;
var processEnv = typeof process !== "undefined" ? process.env : {};
globalThis.DEBUG ??= processEnv.DEBUG ?? "";
globalThis.DEBUG_COLORS ??= processEnv.DEBUG_COLORS ? processEnv.DEBUG_COLORS === "true" : true;
var topProps = {
  enable(namespace) {
    if (typeof namespace === "string") {
      globalThis.DEBUG = namespace;
    }
  },
  disable() {
    const prev = globalThis.DEBUG;
    globalThis.DEBUG = "";
    return prev;
  },
  // this is the core logic to check if logging should happen or not
  enabled(namespace) {
    const listenedNamespaces = globalThis.DEBUG.split(",").map((s) => {
      return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    });
    const isListened = listenedNamespaces.some((listenedNamespace) => {
      if (listenedNamespace === "" || listenedNamespace[0] === "-") return false;
      return namespace.match(RegExp(listenedNamespace.split("*").join(".*") + "$"));
    });
    const isExcluded = listenedNamespaces.some((listenedNamespace) => {
      if (listenedNamespace === "" || listenedNamespace[0] !== "-") return false;
      return namespace.match(RegExp(listenedNamespace.slice(1).split("*").join(".*") + "$"));
    });
    return isListened && !isExcluded;
  },
  log: /* @__PURE__ */ __name((...args) => {
    const [namespace, format, ...rest] = args;
    const logWithFormatting = console.warn ?? console.log;
    logWithFormatting(`${namespace} ${format}`, ...rest);
  }, "log"),
  formatters: {}
  // not implemented
};
function debugCreate(namespace) {
  const instanceProps = {
    color: COLORS[lastColor++ % COLORS.length],
    enabled: topProps.enabled(namespace),
    namespace,
    log: topProps.log,
    extend: /* @__PURE__ */ __name(() => {
    }, "extend")
    // not implemented
  };
  const debugCall = /* @__PURE__ */ __name((...args) => {
    const { enabled, namespace: namespace2, color, log } = instanceProps;
    if (args.length !== 0) {
      argsHistory.push([namespace2, ...args]);
    }
    if (argsHistory.length > MAX_ARGS_HISTORY) {
      argsHistory.shift();
    }
    if (topProps.enabled(namespace2) || enabled) {
      const stringArgs = args.map((arg) => {
        if (typeof arg === "string") {
          return arg;
        }
        return safeStringify(arg);
      });
      const ms = `+${Date.now() - lastTimestamp}ms`;
      lastTimestamp = Date.now();
      if (globalThis.DEBUG_COLORS) {
        log(colors_exports[color](bold(namespace2)), ...stringArgs, colors_exports[color](ms));
      } else {
        log(namespace2, ...stringArgs, ms);
      }
    }
  }, "debugCall");
  return new Proxy(debugCall, {
    get: /* @__PURE__ */ __name((_, prop) => instanceProps[prop], "get"),
    set: /* @__PURE__ */ __name((_, prop, value) => instanceProps[prop] = value, "set")
  });
}
__name(debugCreate, "debugCreate");
var Debug2 = new Proxy(debugCreate, {
  get: /* @__PURE__ */ __name((_, prop) => topProps[prop], "get"),
  set: /* @__PURE__ */ __name((_, prop, value) => topProps[prop] = value, "set")
});
function safeStringify(value, indent = 2) {
  const cache = /* @__PURE__ */ new Set();
  return JSON.stringify(
    value,
    (key, value2) => {
      if (typeof value2 === "object" && value2 !== null) {
        if (cache.has(value2)) {
          return `[Circular *]`;
        }
        cache.add(value2);
      } else if (typeof value2 === "bigint") {
        return value2.toString();
      }
      return value2;
    },
    indent
  );
}
__name(safeStringify, "safeStringify");

// ../node_modules/@prisma/driver-adapter-utils/dist/index.mjs
var DriverAdapterError = class extends Error {
  static {
    __name(this, "DriverAdapterError");
  }
  name = "DriverAdapterError";
  cause;
  constructor(payload) {
    super(typeof payload["message"] === "string" ? payload["message"] : payload.kind);
    this.cause = payload;
  }
};
var debug = Debug2("driver-adapter-utils");
var ColumnTypeEnum = {
  // Scalars
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Set: 14,
  Uuid: 15,
  // Arrays
  Int32Array: 64,
  Int64Array: 65,
  FloatArray: 66,
  DoubleArray: 67,
  NumericArray: 68,
  BooleanArray: 69,
  CharacterArray: 70,
  TextArray: 71,
  DateArray: 72,
  TimeArray: 73,
  DateTimeArray: 74,
  JsonArray: 75,
  EnumArray: 76,
  BytesArray: 77,
  UuidArray: 78,
  // Custom
  UnknownNumber: 128
};
var mockAdapterErrors = {
  queryRaw: new Error("Not implemented: queryRaw"),
  executeRaw: new Error("Not implemented: executeRaw"),
  startTransaction: new Error("Not implemented: startTransaction"),
  executeScript: new Error("Not implemented: executeScript"),
  dispose: new Error("Not implemented: dispose")
};

// ../node_modules/@prisma/adapter-pg/dist/index.mjs
var import_pg = __toESM(require_lib2(), 1);
var import_pg2 = __toESM(require_lib2(), 1);
var import_postgres_array = __toESM(require_postgres_array2(), 1);
var name = "@prisma/adapter-pg";
var FIRST_NORMAL_OBJECT_ID = 16384;
var { types } = import_pg2.default;
var { builtins: ScalarColumnType, getTypeParser } = types;
var ArrayColumnType = {
  BIT_ARRAY: 1561,
  BOOL_ARRAY: 1e3,
  BYTEA_ARRAY: 1001,
  BPCHAR_ARRAY: 1014,
  CHAR_ARRAY: 1002,
  CIDR_ARRAY: 651,
  DATE_ARRAY: 1182,
  FLOAT4_ARRAY: 1021,
  FLOAT8_ARRAY: 1022,
  INET_ARRAY: 1041,
  INT2_ARRAY: 1005,
  INT4_ARRAY: 1007,
  INT8_ARRAY: 1016,
  JSONB_ARRAY: 3807,
  JSON_ARRAY: 199,
  MONEY_ARRAY: 791,
  NUMERIC_ARRAY: 1231,
  OID_ARRAY: 1028,
  TEXT_ARRAY: 1009,
  TIMESTAMP_ARRAY: 1115,
  TIMESTAMPTZ_ARRAY: 1185,
  TIME_ARRAY: 1183,
  UUID_ARRAY: 2951,
  VARBIT_ARRAY: 1563,
  VARCHAR_ARRAY: 1015,
  XML_ARRAY: 143
};
var UnsupportedNativeDataType = class _UnsupportedNativeDataType extends Error {
  static {
    __name(this, "_UnsupportedNativeDataType");
  }
  // map of type codes to type names
  static typeNames = {
    16: "bool",
    17: "bytea",
    18: "char",
    19: "name",
    20: "int8",
    21: "int2",
    22: "int2vector",
    23: "int4",
    24: "regproc",
    25: "text",
    26: "oid",
    27: "tid",
    28: "xid",
    29: "cid",
    30: "oidvector",
    32: "pg_ddl_command",
    71: "pg_type",
    75: "pg_attribute",
    81: "pg_proc",
    83: "pg_class",
    114: "json",
    142: "xml",
    194: "pg_node_tree",
    269: "table_am_handler",
    325: "index_am_handler",
    600: "point",
    601: "lseg",
    602: "path",
    603: "box",
    604: "polygon",
    628: "line",
    650: "cidr",
    700: "float4",
    701: "float8",
    705: "unknown",
    718: "circle",
    774: "macaddr8",
    790: "money",
    829: "macaddr",
    869: "inet",
    1033: "aclitem",
    1042: "bpchar",
    1043: "varchar",
    1082: "date",
    1083: "time",
    1114: "timestamp",
    1184: "timestamptz",
    1186: "interval",
    1266: "timetz",
    1560: "bit",
    1562: "varbit",
    1700: "numeric",
    1790: "refcursor",
    2202: "regprocedure",
    2203: "regoper",
    2204: "regoperator",
    2205: "regclass",
    2206: "regtype",
    2249: "record",
    2275: "cstring",
    2276: "any",
    2277: "anyarray",
    2278: "void",
    2279: "trigger",
    2280: "language_handler",
    2281: "internal",
    2283: "anyelement",
    2287: "_record",
    2776: "anynonarray",
    2950: "uuid",
    2970: "txid_snapshot",
    3115: "fdw_handler",
    3220: "pg_lsn",
    3310: "tsm_handler",
    3361: "pg_ndistinct",
    3402: "pg_dependencies",
    3500: "anyenum",
    3614: "tsvector",
    3615: "tsquery",
    3642: "gtsvector",
    3734: "regconfig",
    3769: "regdictionary",
    3802: "jsonb",
    3831: "anyrange",
    3838: "event_trigger",
    3904: "int4range",
    3906: "numrange",
    3908: "tsrange",
    3910: "tstzrange",
    3912: "daterange",
    3926: "int8range",
    4072: "jsonpath",
    4089: "regnamespace",
    4096: "regrole",
    4191: "regcollation",
    4451: "int4multirange",
    4532: "nummultirange",
    4533: "tsmultirange",
    4534: "tstzmultirange",
    4535: "datemultirange",
    4536: "int8multirange",
    4537: "anymultirange",
    4538: "anycompatiblemultirange",
    4600: "pg_brin_bloom_summary",
    4601: "pg_brin_minmax_multi_summary",
    5017: "pg_mcv_list",
    5038: "pg_snapshot",
    5069: "xid8",
    5077: "anycompatible",
    5078: "anycompatiblearray",
    5079: "anycompatiblenonarray",
    5080: "anycompatiblerange"
  };
  type;
  constructor(code) {
    super();
    this.type = _UnsupportedNativeDataType.typeNames[code] || "Unknown";
    this.message = `Unsupported column type ${this.type}`;
  }
};
function fieldToColumnType(fieldTypeId) {
  switch (fieldTypeId) {
    case ScalarColumnType.INT2:
    case ScalarColumnType.INT4:
      return ColumnTypeEnum.Int32;
    case ScalarColumnType.INT8:
      return ColumnTypeEnum.Int64;
    case ScalarColumnType.FLOAT4:
      return ColumnTypeEnum.Float;
    case ScalarColumnType.FLOAT8:
      return ColumnTypeEnum.Double;
    case ScalarColumnType.BOOL:
      return ColumnTypeEnum.Boolean;
    case ScalarColumnType.DATE:
      return ColumnTypeEnum.Date;
    case ScalarColumnType.TIME:
    case ScalarColumnType.TIMETZ:
      return ColumnTypeEnum.Time;
    case ScalarColumnType.TIMESTAMP:
    case ScalarColumnType.TIMESTAMPTZ:
      return ColumnTypeEnum.DateTime;
    case ScalarColumnType.NUMERIC:
    case ScalarColumnType.MONEY:
      return ColumnTypeEnum.Numeric;
    case ScalarColumnType.JSON:
    case ScalarColumnType.JSONB:
      return ColumnTypeEnum.Json;
    case ScalarColumnType.UUID:
      return ColumnTypeEnum.Uuid;
    case ScalarColumnType.OID:
      return ColumnTypeEnum.Int64;
    case ScalarColumnType.BPCHAR:
    case ScalarColumnType.TEXT:
    case ScalarColumnType.VARCHAR:
    case ScalarColumnType.BIT:
    case ScalarColumnType.VARBIT:
    case ScalarColumnType.INET:
    case ScalarColumnType.CIDR:
    case ScalarColumnType.XML:
      return ColumnTypeEnum.Text;
    case ScalarColumnType.BYTEA:
      return ColumnTypeEnum.Bytes;
    case ArrayColumnType.INT2_ARRAY:
    case ArrayColumnType.INT4_ARRAY:
      return ColumnTypeEnum.Int32Array;
    case ArrayColumnType.FLOAT4_ARRAY:
      return ColumnTypeEnum.FloatArray;
    case ArrayColumnType.FLOAT8_ARRAY:
      return ColumnTypeEnum.DoubleArray;
    case ArrayColumnType.NUMERIC_ARRAY:
    case ArrayColumnType.MONEY_ARRAY:
      return ColumnTypeEnum.NumericArray;
    case ArrayColumnType.BOOL_ARRAY:
      return ColumnTypeEnum.BooleanArray;
    case ArrayColumnType.CHAR_ARRAY:
      return ColumnTypeEnum.CharacterArray;
    case ArrayColumnType.BPCHAR_ARRAY:
    case ArrayColumnType.TEXT_ARRAY:
    case ArrayColumnType.VARCHAR_ARRAY:
    case ArrayColumnType.VARBIT_ARRAY:
    case ArrayColumnType.BIT_ARRAY:
    case ArrayColumnType.INET_ARRAY:
    case ArrayColumnType.CIDR_ARRAY:
    case ArrayColumnType.XML_ARRAY:
      return ColumnTypeEnum.TextArray;
    case ArrayColumnType.DATE_ARRAY:
      return ColumnTypeEnum.DateArray;
    case ArrayColumnType.TIME_ARRAY:
      return ColumnTypeEnum.TimeArray;
    case ArrayColumnType.TIMESTAMP_ARRAY:
      return ColumnTypeEnum.DateTimeArray;
    case ArrayColumnType.TIMESTAMPTZ_ARRAY:
      return ColumnTypeEnum.DateTimeArray;
    case ArrayColumnType.JSON_ARRAY:
    case ArrayColumnType.JSONB_ARRAY:
      return ColumnTypeEnum.JsonArray;
    case ArrayColumnType.BYTEA_ARRAY:
      return ColumnTypeEnum.BytesArray;
    case ArrayColumnType.UUID_ARRAY:
      return ColumnTypeEnum.UuidArray;
    case ArrayColumnType.INT8_ARRAY:
    case ArrayColumnType.OID_ARRAY:
      return ColumnTypeEnum.Int64Array;
    default:
      if (fieldTypeId >= FIRST_NORMAL_OBJECT_ID) {
        return ColumnTypeEnum.Text;
      }
      throw new UnsupportedNativeDataType(fieldTypeId);
  }
}
__name(fieldToColumnType, "fieldToColumnType");
function normalize_array(element_normalizer) {
  return (str) => (0, import_postgres_array.parse)(str, element_normalizer);
}
__name(normalize_array, "normalize_array");
function normalize_numeric(numeric) {
  return numeric;
}
__name(normalize_numeric, "normalize_numeric");
function normalize_date(date) {
  return date;
}
__name(normalize_date, "normalize_date");
function normalize_timestamp(time) {
  return `${time.replace(" ", "T")}+00:00`;
}
__name(normalize_timestamp, "normalize_timestamp");
function normalize_timestamptz(time) {
  return time.replace(" ", "T").replace(/[+-]\d{2}(:\d{2})?$/, "+00:00");
}
__name(normalize_timestamptz, "normalize_timestamptz");
function normalize_time(time) {
  return time;
}
__name(normalize_time, "normalize_time");
function normalize_timez(time) {
  return time.replace(/[+-]\d{2}(:\d{2})?$/, "");
}
__name(normalize_timez, "normalize_timez");
function normalize_money(money) {
  return money.slice(1);
}
__name(normalize_money, "normalize_money");
function normalize_xml(xml) {
  return xml;
}
__name(normalize_xml, "normalize_xml");
function toJson(json) {
  return json;
}
__name(toJson, "toJson");
function encodeBuffer(buffer) {
  return Array.from(new Uint8Array(buffer));
}
__name(encodeBuffer, "encodeBuffer");
var parsePgBytes = getTypeParser(ScalarColumnType.BYTEA);
var parseBytesArray = getTypeParser(ArrayColumnType.BYTEA_ARRAY);
function normalizeByteaArray(serializedBytesArray) {
  const buffers = parseBytesArray(serializedBytesArray);
  return buffers.map((buf) => buf ? encodeBuffer(buf) : null);
}
__name(normalizeByteaArray, "normalizeByteaArray");
function convertBytes(serializedBytes) {
  const buffer = parsePgBytes(serializedBytes);
  return encodeBuffer(buffer);
}
__name(convertBytes, "convertBytes");
function normalizeBit(bit) {
  return bit;
}
__name(normalizeBit, "normalizeBit");
var customParsers = {
  [ScalarColumnType.NUMERIC]: normalize_numeric,
  [ArrayColumnType.NUMERIC_ARRAY]: normalize_array(normalize_numeric),
  [ScalarColumnType.TIME]: normalize_time,
  [ArrayColumnType.TIME_ARRAY]: normalize_array(normalize_time),
  [ScalarColumnType.TIMETZ]: normalize_timez,
  [ScalarColumnType.DATE]: normalize_date,
  [ArrayColumnType.DATE_ARRAY]: normalize_array(normalize_date),
  [ScalarColumnType.TIMESTAMP]: normalize_timestamp,
  [ArrayColumnType.TIMESTAMP_ARRAY]: normalize_array(normalize_timestamp),
  [ScalarColumnType.TIMESTAMPTZ]: normalize_timestamptz,
  [ArrayColumnType.TIMESTAMPTZ_ARRAY]: normalize_array(normalize_timestamptz),
  [ScalarColumnType.MONEY]: normalize_money,
  [ArrayColumnType.MONEY_ARRAY]: normalize_array(normalize_money),
  [ScalarColumnType.JSON]: toJson,
  [ArrayColumnType.JSON_ARRAY]: normalize_array(toJson),
  [ScalarColumnType.JSONB]: toJson,
  [ArrayColumnType.JSONB_ARRAY]: normalize_array(toJson),
  [ScalarColumnType.BYTEA]: convertBytes,
  [ArrayColumnType.BYTEA_ARRAY]: normalizeByteaArray,
  [ArrayColumnType.BIT_ARRAY]: normalize_array(normalizeBit),
  [ArrayColumnType.VARBIT_ARRAY]: normalize_array(normalizeBit),
  [ArrayColumnType.XML_ARRAY]: normalize_array(normalize_xml)
};
function mapArg(arg, argType) {
  if (arg === null) {
    return null;
  }
  if (Array.isArray(arg) && argType.arity === "list") {
    return arg.map((value) => mapArg(value, argType));
  }
  if (typeof arg === "string" && argType.scalarType === "datetime") {
    arg = new Date(arg);
  }
  if (arg instanceof Date) {
    switch (argType.dbType) {
      case "TIME":
      case "TIMETZ":
        return formatTime(arg);
      case "DATE":
        return formatDate(arg);
      default:
        return formatDateTime(arg);
    }
  }
  if (typeof arg === "string" && argType.scalarType === "bytes") {
    return Buffer.from(arg, "base64");
  }
  if (Array.isArray(arg) && argType.scalarType === "bytes") {
    return Buffer.from(arg);
  }
  if (ArrayBuffer.isView(arg)) {
    return Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength);
  }
  return arg;
}
__name(mapArg, "mapArg");
function formatDateTime(date) {
  const pad = /* @__PURE__ */ __name((n, z = 2) => String(n).padStart(z, "0"), "pad");
  const ms = date.getUTCMilliseconds();
  return pad(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + (ms ? "." + String(ms).padStart(3, "0") : "");
}
__name(formatDateTime, "formatDateTime");
function formatDate(date) {
  const pad = /* @__PURE__ */ __name((n, z = 2) => String(n).padStart(z, "0"), "pad");
  return pad(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
}
__name(formatDate, "formatDate");
function formatTime(date) {
  const pad = /* @__PURE__ */ __name((n, z = 2) => String(n).padStart(z, "0"), "pad");
  const ms = date.getUTCMilliseconds();
  return pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + (ms ? "." + String(ms).padStart(3, "0") : "");
}
__name(formatTime, "formatTime");
var TLS_ERRORS = /* @__PURE__ */ new Set([
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_CRL",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "UNABLE_TO_DECRYPT_CRL_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
  "CERT_SIGNATURE_FAILURE",
  "CRL_SIGNATURE_FAILURE",
  "CERT_NOT_YET_VALID",
  "CERT_HAS_EXPIRED",
  "CRL_NOT_YET_VALID",
  "CRL_HAS_EXPIRED",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_CHAIN_TOO_LONG",
  "CERT_REVOKED",
  "INVALID_CA",
  "INVALID_PURPOSE",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "HOSTNAME_MISMATCH",
  "ERR_TLS_CERT_ALTNAME_FORMAT",
  "ERR_TLS_CERT_ALTNAME_INVALID"
]);
var SOCKET_ERRORS = /* @__PURE__ */ new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]);
function convertDriverError(error) {
  if (isSocketError(error)) {
    return mapSocketError(error);
  }
  if (isTlsError(error)) {
    return {
      kind: "TlsConnectionError",
      reason: error.message
    };
  }
  if (isDriverError(error)) {
    return {
      originalCode: error.code,
      originalMessage: error.message,
      ...mapDriverError(error)
    };
  }
  throw error;
}
__name(convertDriverError, "convertDriverError");
function mapDriverError(error) {
  switch (error.code) {
    case "22001":
      return {
        kind: "LengthMismatch",
        column: error.column
      };
    case "22003":
      return {
        kind: "ValueOutOfRange",
        cause: error.message
      };
    case "23505": {
      const fields = error.detail?.match(/Key \(([^)]+)\)/)?.at(1)?.split(", ");
      return {
        kind: "UniqueConstraintViolation",
        constraint: fields !== void 0 ? { fields } : void 0
      };
    }
    case "23502": {
      const fields = error.detail?.match(/Key \(([^)]+)\)/)?.at(1)?.split(", ");
      return {
        kind: "NullConstraintViolation",
        constraint: fields !== void 0 ? { fields } : void 0
      };
    }
    case "23503": {
      let constraint;
      if (error.column) {
        constraint = { fields: [error.column] };
      } else if (error.constraint) {
        constraint = { index: error.constraint };
      }
      return {
        kind: "ForeignKeyConstraintViolation",
        constraint
      };
    }
    case "3D000":
      return {
        kind: "DatabaseDoesNotExist",
        db: error.message.split(" ").at(1)?.split('"').at(1)
      };
    case "28000":
      return {
        kind: "DatabaseAccessDenied",
        db: error.message.split(",").find((s) => s.startsWith(" database"))?.split('"').at(1)
      };
    case "28P01":
      return {
        kind: "AuthenticationFailed",
        user: error.message.split(" ").pop()?.split('"').at(1)
      };
    case "40001":
      return {
        kind: "TransactionWriteConflict"
      };
    case "42P01":
      return {
        kind: "TableDoesNotExist",
        table: error.message.split(" ").at(1)?.split('"').at(1)
      };
    case "42703":
      return {
        kind: "ColumnNotFound",
        column: error.message.split(" ").at(1)?.split('"').at(1)
      };
    case "42P04":
      return {
        kind: "DatabaseAlreadyExists",
        db: error.message.split(" ").at(1)?.split('"').at(1)
      };
    case "53300":
      return {
        kind: "TooManyConnections",
        cause: error.message
      };
    default:
      return {
        kind: "postgres",
        code: error.code ?? "N/A",
        severity: error.severity ?? "N/A",
        message: error.message,
        detail: error.detail,
        column: error.column,
        hint: error.hint
      };
  }
}
__name(mapDriverError, "mapDriverError");
function isDriverError(error) {
  return typeof error.code === "string" && typeof error.message === "string" && typeof error.severity === "string" && (typeof error.detail === "string" || error.detail === void 0) && (typeof error.column === "string" || error.column === void 0) && (typeof error.hint === "string" || error.hint === void 0);
}
__name(isDriverError, "isDriverError");
function mapSocketError(error) {
  switch (error.code) {
    case "ENOTFOUND":
    case "ECONNREFUSED":
      return {
        kind: "DatabaseNotReachable",
        host: error.address ?? error.hostname,
        port: error.port
      };
    case "ECONNRESET":
      return {
        kind: "ConnectionClosed"
      };
    case "ETIMEDOUT":
      return {
        kind: "SocketTimeout"
      };
  }
}
__name(mapSocketError, "mapSocketError");
function isSocketError(error) {
  return typeof error.code === "string" && typeof error.syscall === "string" && typeof error.errno === "number" && SOCKET_ERRORS.has(error.code);
}
__name(isSocketError, "isSocketError");
function isTlsError(error) {
  if (typeof error.code === "string") {
    return TLS_ERRORS.has(error.code);
  }
  switch (error.message) {
    case "The server does not support SSL connections":
    case "There was an error establishing an SSL connection":
      return true;
  }
  return false;
}
__name(isTlsError, "isTlsError");
var types2 = import_pg.default.types;
var debug2 = Debug2("prisma:driver-adapter:pg");
var PgQueryable = class {
  static {
    __name(this, "PgQueryable");
  }
  constructor(client, pgOptions) {
    this.client = client;
    this.pgOptions = pgOptions;
  }
  provider = "postgres";
  adapterName = name;
  /**
   * Execute a query given as SQL, interpolating the given parameters.
   */
  async queryRaw(query) {
    const tag = "[js::query_raw]";
    debug2(`${tag} %O`, query);
    const { fields, rows } = await this.performIO(query);
    const columnNames = fields.map((field) => field.name);
    let columnTypes = [];
    try {
      columnTypes = fields.map((field) => fieldToColumnType(field.dataTypeID));
    } catch (e) {
      if (e instanceof UnsupportedNativeDataType) {
        throw new DriverAdapterError({
          kind: "UnsupportedNativeDataType",
          type: e.type
        });
      }
      throw e;
    }
    const udtParser = this.pgOptions?.userDefinedTypeParser;
    if (udtParser) {
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field.dataTypeID >= FIRST_NORMAL_OBJECT_ID && !Object.hasOwn(customParsers, field.dataTypeID)) {
          for (let j = 0; j < rows.length; j++) {
            rows[j][i] = await udtParser(field.dataTypeID, rows[j][i], this);
          }
        }
      }
    }
    return {
      columnNames,
      columnTypes,
      rows
    };
  }
  /**
   * Execute a query given as SQL, interpolating the given parameters and
   * returning the number of affected rows.
   * Note: Queryable expects a u64, but napi.rs only supports u32.
   */
  async executeRaw(query) {
    const tag = "[js::execute_raw]";
    debug2(`${tag} %O`, query);
    return (await this.performIO(query)).rowCount ?? 0;
  }
  /**
   * Run a query against the database, returning the result set.
   * Should the query fail due to a connection error, the connection is
   * marked as unhealthy.
   */
  async performIO(query) {
    const { sql, args } = query;
    const values = args.map((arg, i) => mapArg(arg, query.argTypes[i]));
    try {
      const result = await this.client.query(
        {
          text: sql,
          values,
          rowMode: "array",
          types: {
            // This is the error expected:
            // No overload matches this call.
            // The last overload gave the following error.
            // Type '(oid: number, format?: any) => (json: string) => unknown' is not assignable to type '{ <T>(oid: number): TypeParser<string, string | T>; <T>(oid: number, format: "text"): TypeParser<string, string | T>; <T>(oid: number, format: "binary"): TypeParser<...>; }'.
            //   Type '(json: string) => unknown' is not assignable to type 'TypeParser<Buffer, any>'.
            //     Types of parameters 'json' and 'value' are incompatible.
            //       Type 'Buffer' is not assignable to type 'string'.ts(2769)
            //
            // Because pg-types types expect us to handle both binary and text protocol versions,
            // where as far we can see, pg will ever pass only text version.
            //
            // @ts-expect-error
            getTypeParser: /* @__PURE__ */ __name((oid, format) => {
              if (format === "text" && customParsers[oid]) {
                return customParsers[oid];
              }
              return types2.getTypeParser(oid, format);
            }, "getTypeParser")
          }
        },
        values
      );
      return result;
    } catch (e) {
      this.onError(e);
    }
  }
  onError(error) {
    debug2("Error in performIO: %O", error);
    throw new DriverAdapterError(convertDriverError(error));
  }
};
var PgTransaction = class extends PgQueryable {
  static {
    __name(this, "PgTransaction");
  }
  constructor(client, options, pgOptions, cleanup) {
    super(client, pgOptions);
    this.options = options;
    this.pgOptions = pgOptions;
    this.cleanup = cleanup;
  }
  async commit() {
    debug2(`[js::commit]`);
    this.cleanup?.();
    this.client.release();
  }
  async rollback() {
    debug2(`[js::rollback]`);
    this.cleanup?.();
    this.client.release();
  }
};
var PrismaPgAdapter = class extends PgQueryable {
  static {
    __name(this, "PrismaPgAdapter");
  }
  constructor(client, pgOptions, release) {
    super(client);
    this.pgOptions = pgOptions;
    this.release = release;
  }
  async startTransaction(isolationLevel) {
    const options = {
      usePhantomQuery: false
    };
    const tag = "[js::startTransaction]";
    debug2("%s options: %O", tag, options);
    const conn = await this.client.connect().catch((error) => this.onError(error));
    const onError = /* @__PURE__ */ __name((err) => {
      debug2(`Error from pool connection: ${err.message} %O`, err);
      this.pgOptions?.onConnectionError?.(err);
    }, "onError");
    conn.on("error", onError);
    const cleanup = /* @__PURE__ */ __name(() => {
      conn.removeListener("error", onError);
    }, "cleanup");
    try {
      const tx = new PgTransaction(conn, options, this.pgOptions, cleanup);
      await tx.executeRaw({ sql: "BEGIN", args: [], argTypes: [] });
      if (isolationLevel) {
        await tx.executeRaw({
          sql: `SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`,
          args: [],
          argTypes: []
        });
      }
      return tx;
    } catch (error) {
      cleanup();
      conn.release(error);
      this.onError(error);
    }
  }
  async executeScript(script) {
    const statements = script.split(";").map((stmt) => stmt.trim()).filter((stmt) => stmt.length > 0);
    for (const stmt of statements) {
      try {
        await this.client.query(stmt);
      } catch (error) {
        this.onError(error);
      }
    }
  }
  getConnectionInfo() {
    return {
      schemaName: this.pgOptions?.schema,
      supportsRelationJoins: true
    };
  }
  async dispose() {
    return this.release?.();
  }
  underlyingDriver() {
    return this.client;
  }
};
var PrismaPgAdapterFactory = class {
  static {
    __name(this, "PrismaPgAdapterFactory");
  }
  constructor(poolOrConfig, options) {
    this.options = options;
    if (poolOrConfig instanceof import_pg.default.Pool) {
      this.externalPool = poolOrConfig;
      this.config = poolOrConfig.options;
    } else {
      this.externalPool = null;
      this.config = poolOrConfig;
    }
  }
  provider = "postgres";
  adapterName = name;
  config;
  externalPool;
  async connect() {
    const client = this.externalPool ?? new import_pg.default.Pool(this.config);
    const onIdleClientError = /* @__PURE__ */ __name((err) => {
      debug2(`Error from idle pool client: ${err.message} %O`, err);
      this.options?.onPoolError?.(err);
    }, "onIdleClientError");
    client.on("error", onIdleClientError);
    return new PrismaPgAdapter(client, this.options, async () => {
      if (this.externalPool) {
        if (this.options?.disposeExternalPool) {
          await this.externalPool.end();
          this.externalPool = null;
        } else {
          this.externalPool.removeListener("error", onIdleClientError);
        }
      } else {
        await client.end();
      }
    });
  }
  async connectToShadowDb() {
    const conn = await this.connect();
    const database = `prisma_migrate_shadow_db_${globalThis.crypto.randomUUID()}`;
    await conn.executeScript(`CREATE DATABASE "${database}"`);
    const client = new import_pg.default.Pool({ ...this.config, database });
    return new PrismaPgAdapter(client, void 0, async () => {
      await conn.executeScript(`DROP DATABASE "${database}"`);
      await client.end();
    });
  }
};

// ../worker/v2-tenant-router-runtime-diagnostic.ts
var import_client = __toESM(require_default2(), 1);
var diagnosticTokenHeader = "x-olfactoryops-candidate-runtime-diagnostic";
var candidateBaseDomain = "next.labofscents.org";
var rolePattern = /^[a-z_][a-z0-9_]{0,62}$/;
var sha256Pattern = /^[a-f0-9]{64}$/i;
function normalizedDiagnosticFixtureHostname(value) {
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  const suffix = `.${candidateBaseDomain}`;
  const label = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? hostname : null;
}
__name(normalizedDiagnosticFixtureHostname, "normalizedDiagnosticFixtureHostname");
function equalSecret(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
__name(equalSecret, "equalSecret");
async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function runtimeDiagnosticFromRow(row, expectedDatabaseNameSha, databaseNameSha, targetReleaseSha) {
  return {
    targetReleaseSha,
    hyperdriveConnectionReachable: true,
    hyperdriveProductionDatabaseMatch: equalSecret(databaseNameSha, expectedDatabaseNameSha.toLowerCase()),
    runtimeCurrentUserMatchesExpected: row.currentUserMatchesExpected,
    runtimeSessionUserMatchesExpected: row.sessionUserMatchesExpected,
    runtimeDirectHostnameVisible: row.directHostnameVisible,
    runtimeDirectOrganizationVisible: row.directOrganizationVisible,
    resolverQueryExecuted: true,
    runtimeResolverResult: row.resolverResult,
    workspaceHostnamesRls: row.workspaceHostnamesRlsEnabled,
    workspaceHostnamesForceRls: row.workspaceHostnamesForceRls,
    organizationsRls: row.organizationsRlsEnabled,
    organizationsForceRls: row.organizationsForceRls,
    resolverSecurityDefiner: row.resolverSecurityDefiner,
    functionOwnerOwnsWorkspaceHostnames: row.functionOwnerOwnsWorkspaceHostnames,
    functionOwnerOwnsOrganizations: row.functionOwnerOwnsOrganizations,
    functionOwnerIsSuperuser: row.functionOwnerIsSuperuser,
    functionOwnerBypassRls: row.functionOwnerBypassRls,
    functionOwnerForceRlsConstrained: row.functionOwnerForceRlsConstrained,
    runtimeExecuteGranted: row.runtimeExecuteGranted,
    runtimeRequestHostnameContextPresent: row.requestHostnameContextPresent,
    runtimeOrganizationContextPresent: row.organizationContextPresent,
    runtimeUserContextPresent: row.userContextPresent
  };
}
__name(runtimeDiagnosticFromRow, "runtimeDiagnosticFromRow");
function runtimeDiagnosticExecutionPass(diagnostic) {
  return [
    diagnostic.hyperdriveConnectionReachable,
    diagnostic.hyperdriveProductionDatabaseMatch,
    diagnostic.runtimeCurrentUserMatchesExpected,
    diagnostic.runtimeSessionUserMatchesExpected,
    diagnostic.workspaceHostnamesRls,
    diagnostic.workspaceHostnamesForceRls,
    diagnostic.organizationsRls,
    diagnostic.organizationsForceRls,
    diagnostic.runtimeExecuteGranted,
    diagnostic.resolverQueryExecuted
  ].every(Boolean) && !diagnostic.runtimeDirectHostnameVisible && !diagnostic.runtimeDirectOrganizationVisible && !diagnostic.runtimeRequestHostnameContextPresent && !diagnostic.runtimeOrganizationContextPresent && !diagnostic.runtimeUserContextPresent;
}
__name(runtimeDiagnosticExecutionPass, "runtimeDiagnosticExecutionPass");
function resolverHealth(diagnostic) {
  return diagnostic.runtimeResolverResult ? "PASS" : "FAIL";
}
__name(resolverHealth, "resolverHealth");
async function inspectCandidateRuntime(env) {
  const hostname = normalizedDiagnosticFixtureHostname(env.DIAGNOSTIC_FIXTURE_HOSTNAME);
  if (!hostname || !rolePattern.test(env.V2_RUNTIME_DB_ROLE) || !sha256Pattern.test(env.V2_EXPECTED_DATABASE_NAME_SHA) || !/^[a-f0-9]{40}$/i.test(env.TARGET_RELEASE_SHA)) {
    throw new Error("candidate runtime diagnostic configuration is invalid");
  }
  const prisma = new import_client.PrismaClient({ adapter: new PrismaPgAdapterFactory({ connectionString: env.HYPERDRIVE.connectionString }) });
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        current_database() AS "databaseName",
        current_user = ${env.V2_RUNTIME_DB_ROLE} AS "currentUserMatchesExpected",
        session_user = ${env.V2_RUNTIME_DB_ROLE} AS "sessionUserMatchesExpected",
        EXISTS (
          SELECT 1 FROM public.v2_workspace_hostnames hostname
          WHERE hostname.hostname = ${hostname} AND hostname.status = 'ACTIVE'
        ) AS "directHostnameVisible",
        EXISTS (
          SELECT 1
          FROM public.v2_workspace_hostnames hostname
          INNER JOIN public.v2_organizations organization ON organization.id = hostname.organization_id
          WHERE hostname.hostname = ${hostname}
            AND hostname.status = 'ACTIVE'
            AND organization.status = 'ACTIVE'
        ) AS "directOrganizationVisible",
        EXISTS (
          SELECT 1 FROM public.v2_resolve_active_workspace_hostname(${hostname})
        ) AS "resolverResult",
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesRlsEnabled",
        COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_workspace_hostnames'::regclass), false) AS "workspaceHostnamesForceRls",
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsRlsEnabled",
        COALESCE((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.v2_organizations'::regclass), false) AS "organizationsForceRls",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
        ) AS "resolverSecurityDefiner",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_class workspace_hostnames ON workspace_hostnames.oid = 'public.v2_workspace_hostnames'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = workspace_hostnames.relowner
        ) AS "functionOwnerOwnsWorkspaceHostnames",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_class organizations ON organizations.oid = 'public.v2_organizations'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = organizations.relowner
        ) AS "functionOwnerOwnsOrganizations",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_owner.rolsuper
        ) AS "functionOwnerIsSuperuser",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_owner.rolbypassrls
        ) AS "functionOwnerBypassRls",
        EXISTS (
          SELECT 1
          FROM pg_proc function_definition
          INNER JOIN pg_namespace namespace ON namespace.oid = function_definition.pronamespace
          INNER JOIN pg_roles function_owner ON function_owner.oid = function_definition.proowner
          INNER JOIN pg_class workspace_hostnames ON workspace_hostnames.oid = 'public.v2_workspace_hostnames'::regclass
          INNER JOIN pg_class organizations ON organizations.oid = 'public.v2_organizations'::regclass
          WHERE namespace.nspname = 'public'
            AND function_definition.proname = 'v2_resolve_active_workspace_hostname'
            AND pg_get_function_identity_arguments(function_definition.oid) = 'p_hostname text'
            AND function_definition.prosecdef
            AND function_definition.proowner = workspace_hostnames.relowner
            AND function_definition.proowner = organizations.relowner
            AND workspace_hostnames.relforcerowsecurity
            AND organizations.relforcerowsecurity
            AND NOT function_owner.rolsuper
            AND NOT function_owner.rolbypassrls
        ) AS "functionOwnerForceRlsConstrained",
        has_function_privilege(current_user, 'public.v2_resolve_active_workspace_hostname(text)', 'EXECUTE') AS "runtimeExecuteGranted",
        COALESCE(NULLIF(current_setting('app.request_hostname', true), ''), '') <> '' AS "requestHostnameContextPresent",
        COALESCE(NULLIF(current_setting('app.organization_id', true), ''), '') <> '' AS "organizationContextPresent",
        COALESCE(NULLIF(current_setting('app.user_id', true), ''), '') <> '' AS "userContextPresent"
    `;
    const row = rows[0];
    if (!row) throw new Error("candidate runtime diagnostic returned no row");
    return runtimeDiagnosticFromRow(row, env.V2_EXPECTED_DATABASE_NAME_SHA, await sha256(row.databaseName), env.TARGET_RELEASE_SHA);
  } finally {
    await prisma.$disconnect();
  }
}
__name(inspectCandidateRuntime, "inspectCandidateRuntime");
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store, max-age=0", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }
  });
}
__name(notFound, "notFound");
function unavailable() {
  return Response.json({ candidateRuntimeDiagnostic: "UNAVAILABLE" }, {
    status: 503,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}
__name(unavailable, "unavailable");
function createCandidateRuntimeDiagnostic(inspector = inspectCandidateRuntime) {
  return {
    async fetch(request, env) {
      if (request.method !== "GET" || !env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN || !equalSecret(request.headers.get(diagnosticTokenHeader) ?? "", env.CANDIDATE_RUNTIME_DIAGNOSTIC_TOKEN)) {
        return notFound();
      }
      try {
        return Response.json({ candidateRuntimeDiagnostic: "COMPLETE", ...await inspector(env) }, {
          headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" }
        });
      } catch {
        return unavailable();
      }
    }
  };
}
__name(createCandidateRuntimeDiagnostic, "createCandidateRuntimeDiagnostic");
var v2_tenant_router_runtime_diagnostic_default = createCandidateRuntimeDiagnostic();
export {
  createCandidateRuntimeDiagnostic,
  v2_tenant_router_runtime_diagnostic_default as default,
  normalizedDiagnosticFixtureHostname,
  resolverHealth,
  runtimeDiagnosticExecutionPass,
  runtimeDiagnosticFromRow
};
//# sourceMappingURL=v2-tenant-router-runtime-diagnostic.js.map
