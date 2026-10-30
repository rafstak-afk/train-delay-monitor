// Minimalny dekoder GTFS-Realtime (protobuf) dla danych na żywo ZTM GZM —
// bez zewnętrznych bibliotek. Czyta tylko pola, których potrzebujemy:
// nagłówek (czas), aktualizacje kursów (opóźnienie, odwołanie), pozycje
// pojazdów i komunikaty. Ten sam plik w przeglądarce (window.GzmRtCore),
// w Node (require) i w Pages Function (import, jak guard-core.js).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GzmRtCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // --- czytnik protobuf: pola jako lista [numer, typ, wartość] ---
  function readVarint(buf, pos) {
    var lo = 0, hi = 0, shift = 0, b;
    do {
      b = buf[pos.i++];
      if (shift < 28) lo |= (b & 0x7f) << shift;
      else if (shift < 32) { lo |= (b & 0x7f) << shift; hi |= (b & 0x7f) >>> (32 - shift); }
      else hi |= (b & 0x7f) << (shift - 32);
      shift += 7;
    } while (b & 0x80);
    pos.lo = lo >>> 0;   // dolne 32 bity — int32 ujemne zapisane jako 10-bajtowy varint
    return (hi >>> 0) * 4294967296 + (lo >>> 0);
  }
  function fields(buf, start, end) {
    var pos = { i: start || 0 }, stop = end == null ? buf.length : end, out = [];
    while (pos.i < stop) {
      var key = readVarint(buf, pos), no = Math.floor(key / 8), wt = key & 7, v;
      var lo32 = 0;
      if (wt === 0) { v = readVarint(buf, pos); lo32 = pos.lo; }
      else if (wt === 1) { v = { s: pos.i, e: pos.i + 8 }; pos.i += 8; }
      else if (wt === 2) { var len = readVarint(buf, pos); v = { s: pos.i, e: pos.i + len }; pos.i += len; }
      else if (wt === 5) { v = { s: pos.i, e: pos.i + 4 }; pos.i += 4; }
      else throw new Error("protobuf: nieobsługiwany typ " + wt);
      out.push([no, wt, v, lo32]);
    }
    return out;
  }
  function str(buf, v) {
    var s = v.s, e = v.e;
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(buf.subarray(s, e));
    return Buffer.from(buf.subarray(s, e)).toString("utf8");
  }
  function f32(buf, v) { return new DataView(buf.buffer, buf.byteOffset + v.s, 4).getFloat32(0, true); }
  function int32(f) { return f[3] | 0; }   // pole int32 (varint): dolne 32 bity ze znakiem
  function i64(n) { return n > 9007199254740991 ? n - 18446744073709551616 : n; }

  function tripDescriptor(buf, v) {
    var t = {};
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 1) t.tripId = str(buf, f[2]);
      else if (f[0] === 2) t.startTime = str(buf, f[2]);
      else if (f[0] === 3) t.startDate = str(buf, f[2]);
      else if (f[0] === 4) t.rel = f[2];              // 0 SCHEDULED, 1 ADDED, 2 UNSCHEDULED, 3 CANCELED
      else if (f[0] === 5) t.routeId = str(buf, f[2]);
      else if (f[0] === 6) t.directionId = f[2];
    });
    return t;
  }
  function vehicleDescriptor(buf, v) {
    var d = {};
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 1) d.id = str(buf, f[2]);
      else if (f[0] === 2) d.label = str(buf, f[2]);
      else if (f[0] === 3) d.plate = str(buf, f[2]);
    });
    return d;
  }
  function stopTimeEvent(buf, v) {
    var ev = {};
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 1) ev.delay = int32(f);
      else if (f[0] === 2) ev.time = i64(f[2]);
    });
    return ev;
  }
  function tripUpdate(buf, v) {
    var u = { stu: [] };
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 1) u.trip = tripDescriptor(buf, f[2]);
      else if (f[0] === 3) u.vehicle = vehicleDescriptor(buf, f[2]);
      else if (f[0] === 4) u.timestamp = f[2];
      else if (f[0] === 5) u.delay = int32(f);
      else if (f[0] === 2) {
        var s = {};
        fields(buf, f[2].s, f[2].e).forEach(function (g) {
          if (g[0] === 1) s.seq = g[2];
          else if (g[0] === 2) s.arr = stopTimeEvent(buf, g[2]);
          else if (g[0] === 3) s.dep = stopTimeEvent(buf, g[2]);
          else if (g[0] === 4) s.stopId = str(buf, g[2]);
          else if (g[0] === 5) s.rel = g[2];        // 1 SKIPPED, 2 NO_DATA
        });
        u.stu.push(s);
      }
    });
    return u;
  }
  function vehiclePosition(buf, v) {
    var p = {};
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 1) p.trip = tripDescriptor(buf, f[2]);
      else if (f[0] === 2) fields(buf, f[2].s, f[2].e).forEach(function (g) {
        if (g[0] === 1) p.lat = f32(buf, g[2]);
        else if (g[0] === 2) p.lon = f32(buf, g[2]);
        else if (g[0] === 3) p.bearing = f32(buf, g[2]);
        else if (g[0] === 5) p.speed = f32(buf, g[2]);
      });
      else if (f[0] === 3) p.stopSeq = f[2];
      else if (f[0] === 4) p.status = f[2];          // 0 INCOMING_AT, 1 STOPPED_AT, 2 IN_TRANSIT_TO
      else if (f[0] === 5) p.timestamp = f[2];
      else if (f[0] === 7) p.stopId = str(buf, f[2]);
      else if (f[0] === 8) p.vehicle = vehicleDescriptor(buf, f[2]);
    });
    return p;
  }
  function translated(buf, v) {
    var out = [];
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] !== 1) return;
      var t = {};
      fields(buf, f[2].s, f[2].e).forEach(function (g) { if (g[0] === 1) t.text = str(buf, g[2]); else if (g[0] === 2) t.lang = str(buf, g[2]); });
      out.push(t);
    });
    return out;
  }
  function alert(buf, v) {
    var a = { entities: [] };
    fields(buf, v.s, v.e).forEach(function (f) {
      if (f[0] === 5) { var r = {}; fields(buf, f[2].s, f[2].e).forEach(function (g) { if (g[0] === 1) r.start = g[2]; else if (g[0] === 2) r.end = g[2]; }); (a.periods = a.periods || []).push(r); }
      else if (f[0] === 6) {
        var ie = {};
        fields(buf, f[2].s, f[2].e).forEach(function (g) {
          if (g[0] === 2) ie.routeId = str(buf, g[2]);
          else if (g[0] === 4) ie.trip = tripDescriptor(buf, g[2]);
          else if (g[0] === 5) ie.stopId = str(buf, g[2]);
        });
        a.entities.push(ie);
      }
      else if (f[0] === 7) a.cause = f[2];
      else if (f[0] === 8) a.effect = f[2];
      else if (f[0] === 10) a.header = translated(buf, f[2]);
      else if (f[0] === 11) a.description = translated(buf, f[2]);
    });
    return a;
  }

  // Cały FeedMessage → { timestamp, entities: [{ id, deleted, tripUpdate, vehicle, alert }] }
  function decodeFeed(bytes) {
    var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var feed = { timestamp: null, version: null, entities: [] };
    fields(buf).forEach(function (f) {
      if (f[0] === 1) fields(buf, f[2].s, f[2].e).forEach(function (g) {
        if (g[0] === 1) feed.version = str(buf, g[2]);
        else if (g[0] === 3) feed.timestamp = g[2];
      });
      else if (f[0] === 2) {
        var e = {};
        fields(buf, f[2].s, f[2].e).forEach(function (g) {
          if (g[0] === 1) e.id = str(buf, g[2]);
          else if (g[0] === 2) e.deleted = !!g[2];
          else if (g[0] === 3) e.tripUpdate = tripUpdate(buf, g[2]);
          else if (g[0] === 4) e.vehicle = vehiclePosition(buf, g[2]);
          else if (g[0] === 5) e.alert = alert(buf, g[2]);
        });
        feed.entities.push(e);
      }
    });
    return feed;
  }

  return { decodeFeed: decodeFeed };
});
