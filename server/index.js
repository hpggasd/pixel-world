let admins = {};

const fs = require("fs");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const ADMIN_KEY = "1234"; // 나중에 바꿔

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = 3001;

// 메모리 픽셀 저장소 (MVP용)
let pixels = {};

let userDots = {}; // socket.id 기준 Dot 저장
const DOT_CAP = 150;

let saveTimer = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile("pixels.json", JSON.stringify(pixels), (err) => {
      if (err) console.log("❌ save error:", err);
    });
  }, 1000);
}

try {
  const data = fs.readFileSync("pixels.json");
  pixels = JSON.parse(data);
  console.log("📂 pixels loaded");
} catch (err) {
  console.log("📂 no existing pixels file, starting fresh");
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  userDots[socket.id] = 50;
  socket.emit("dotInit", userDots[socket.id]);
  socket.emit("init", pixels);

  // 관리자 로그인
  socket.on("admin:login", (key) => {
    if (key === ADMIN_KEY) {
      admins[socket.id] = true;
      console.log("👑 Admin logged in:", socket.id);
    }
  });

  // 전체 맵 초기화
  socket.on("admin:clear", (key) => {
    if (key !== ADMIN_KEY) return;

    pixels = {};
    fs.writeFileSync("pixels.json", JSON.stringify({}));
    io.emit("init", pixels);

    console.log("🔥 ADMIN CLEAR ALL PIXELS");
  });

  // 특정 영역 초기화
  socket.on("admin:clearArea", ({ x1, y1, x2, y2 }) => {
    if (!admins[socket.id]) {
      console.log("❌ Unauthorized area clear attempt");
      return;
    }

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        delete pixels[`${x},${y}`];
      }
    }

    scheduleSave();
    io.emit("init", pixels);

    console.log("🔥 ADMIN CLEAR AREA:", x1, y1, x2, y2);
  });

  // draw 이벤트
  socket.on("draw", ({ x, y, color }) => {
    // 관리자면 Dot 무제한
    if (!admins[socket.id]) {
      if (userDots[socket.id] <= 0) return;

      userDots[socket.id] -= 1;
      socket.emit("dotUpdate", userDots[socket.id]);
    }

    const key = `${x},${y}`;
    pixels[key] = color;

    scheduleSave();
    io.emit("update", { x, y, color });
  });

  socket.on("disconnect", () => {
    delete userDots[socket.id];
    delete admins[socket.id];
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
