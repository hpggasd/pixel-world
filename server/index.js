let admins = {};

const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const ADMIN_KEY = "1234";

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = 3001;

// --------------------
// WORLD DATA
// --------------------

let pixels = {};
let lands = {};
let userDots = {};
let userInk = {};

const DOT_CAP = 150;

let saveTimer = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    fs.writeFile("pixels.json", JSON.stringify(pixels), (err) => {
      if (err) console.log("save error", err);
    });
  }, 1000);
}

try {
  const data = fs.readFileSync("pixels.json");
  pixels = JSON.parse(data);
  console.log("pixels loaded");
} catch {
  console.log("no pixels file");
}

// --------------------
// LAND CAPTURE CHECK
// --------------------

function checkCapture(land, color) {
  const { minX, minY, maxX, maxY } = land.boundingBox;

  const ringMinX = minX - 1;
  const ringMinY = minY - 1;
  const ringMaxX = maxX + 1;
  const ringMaxY = maxY + 1;

  for (let x = ringMinX; x <= ringMaxX; x++) {
    if (pixels[`${x},${ringMinY}`] !== color) return false;
    if (pixels[`${x},${ringMaxY}`] !== color) return false;
  }

  for (let y = ringMinY; y <= ringMaxY; y++) {
    if (pixels[`${ringMinX},${y}`] !== color) return false;
    if (pixels[`${ringMaxX},${y}`] !== color) return false;
  }

  return true;
}

// --------------------
// REMOVE RING
// --------------------

function removeRing(land) {
  const { minX, minY, maxX, maxY } = land.boundingBox;

  const ringMinX = minX - 1;
  const ringMinY = minY - 1;
  const ringMaxX = maxX + 1;
  const ringMaxY = maxY + 1;

  for (let x = ringMinX; x <= ringMaxX; x++) {
    delete pixels[`${x},${ringMinY}`];
    delete pixels[`${x},${ringMaxY}`];
  }

  for (let y = ringMinY; y <= ringMaxY; y++) {
    delete pixels[`${ringMinX},${y}`];
    delete pixels[`${ringMaxX},${y}`];
  }
}

// --------------------
// CONNECTION
// --------------------

io.on("connection", (socket) => {
  console.log("user connected", socket.id);

  userDots[socket.id] = 50;
  userInk[socket.id] = 0;

  socket.emit("init", pixels);
  socket.emit("land:update", lands);
  socket.emit("dotInit", userDots[socket.id]);
  socket.emit("inkInit", userInk[socket.id]);

  // --------------------
  // ADMIN LOGIN
  // --------------------

  socket.on("admin:login", (key) => {
    if (key === ADMIN_KEY) {
      admins[socket.id] = true;
      console.log("admin login", socket.id);
    }
  });

  // --------------------
  // ADMIN CLEAR MAP
  // --------------------

  socket.on("admin:clear", () => {
    if (!admins[socket.id]) return;

    pixels = {};
    fs.writeFileSync("pixels.json", JSON.stringify({}));

    io.emit("init", pixels);
  });

  // --------------------
  // ADMIN CREATE LAND
  // --------------------

  socket.on("land:create", (pixelList) => {
    if (!admins[socket.id]) return;

    if (pixelList.length < 100) return;

    const landId = Date.now().toString();

    const xs = pixelList.map((p) => p.x);
    const ys = pixelList.map((p) => p.y);

    lands[landId] = {
      pixels: pixelList.map((p) => `${p.x},${p.y}`),
      owners: [],
      boundingBox: {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
    };

    io.emit("land:update", lands);

    console.log("land created", landId);
  });

  // --------------------
  // DRAW PIXEL
  // --------------------

  socket.on("draw", ({ x, y, color }) => {
    if (!admins[socket.id]) {
      if (!userDots[socket.id] || userDots[socket.id] <= 0) return;

      userDots[socket.id] -= 1;
      socket.emit("dotUpdate", userDots[socket.id]);
    }

    const key = `${x},${y}`;
    pixels[key] = color;

    scheduleSave();

    io.emit("update", { x, y, color });

    // --------------------
    // CAPTURE CHECK
    // --------------------

    for (let landId in lands) {
      const land = lands[landId];

      if (checkCapture(land, color)) {
        if (!land.owners.includes(socket.id)) {
          land.owners.push(socket.id);

          const size =
            (land.boundingBox.maxX - land.boundingBox.minX + 1) *
            (land.boundingBox.maxY - land.boundingBox.minY + 1);

          const reward = Math.min(200, Math.floor(size / 20));

          userInk[socket.id] += reward;

          socket.emit("inkUpdate", userInk[socket.id]);

          removeRing(land);

          io.emit("land:update", lands);

          console.log("land captured", landId);
        }
      }
    }
  });

  // --------------------
  // DISCONNECT
  // --------------------

  socket.on("disconnect", () => {
    delete userDots[socket.id];
    delete userInk[socket.id];
    delete admins[socket.id];

    console.log("disconnect", socket.id);
  });
});

// --------------------

server.listen(PORT, () => {
  console.log("server running on", PORT);
});
