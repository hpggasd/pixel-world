import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://" + window.location.hostname + ":3001");
window.socket = socket;

const GRID_SIZE = 50;

const PALETTE = [
  { color: "#000000", name: "Black", cost: 0 },
  { color: "#FFFFFF", name: "Eraser", cost: 0 },
  { color: "#FF0000", name: "Red", cost: 0 },
  { color: "#0000FF", name: "Blue", cost: 0 },
  { color: "#00FF00", name: "Green", cost: 10 },
  { color: "#FFFF00", name: "Yellow", cost: 10 },
  { color: "#FF00FF", name: "Magenta", cost: 10 },
  { color: "#00FFFF", name: "Cyan", cost: 10 },
  { color: "#FFA500", name: "Orange", cost: 20 },
  { color: "#8B4513", name: "Brown", cost: 20 },
  { color: "#808080", name: "Gray", cost: 20 },
  { color: "#800080", name: "Purple", cost: 20 },
];

function App() {
  const [pixels, setPixels] = useState({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [dot, setDot] = useState(50);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const DOT_CAP = 150;
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [ink, setInk] = useState(50);
  const [unlocked, setUnlocked] = useState(
    () => new Set(["#000000", "#FFFFFF", "#FF0000", "#0000FF"]),
  );

  const grid = useMemo(() => Array.from({ length: GRID_SIZE * GRID_SIZE }), []);

  useEffect(() => {
    socket.on("init", (serverPixels) => {
      setPixels(serverPixels);
    });

    socket.on("update", ({ x, y, color }) => {
      setPixels((prev) => ({
        ...prev,
        [`${x},${y}`]: color,
      }));
    });

    return () => {
      socket.off("init");
      socket.off("update");
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDot((prev) => {
        if (prev >= DOT_CAP) return prev;
        return prev + 1;
      });
    }, 36000);

    return () => clearInterval(interval);
  }, []);

  const drawPixel = (x, y) => {
    if (dot <= 0) return;

    socket.emit("draw", { x, y, color: selectedColor });

    setDot((prev) => prev - 1);
  };

  return (
    <div
      style={{
        userSelect: "none",
      }}
      onMouseUp={() => {
        setIsDrawing(false);

        if (isSelecting && selectionStart && selectionEnd) {
          const x1 = Math.min(selectionStart.x, selectionEnd.x);
          const y1 = Math.min(selectionStart.y, selectionEnd.y);
          const x2 = Math.max(selectionStart.x, selectionEnd.x);
          const y2 = Math.max(selectionStart.y, selectionEnd.y);

          socket.emit("admin:clearArea", {
            x1,
            y1,
            x2,
            y2,
          });

          setIsSelecting(false);
          setSelectionStart(null);
          setSelectionEnd(null);
        }
      }}
      onMouseLeave={() => setIsDrawing(false)}
      onTouchEnd={() => setIsDrawing(false)}
    >
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {!isAdmin ? (
          <button
            onClick={() => {
              const input = prompt("관리자 비밀번호 입력");
              if (input === "1234") {
                setIsAdmin(true);
                socket.emit("admin:login", "1234");
              } else {
                alert("비밀번호 틀림");
              }
            }}
          >
            Admin Login
          </button>
        ) : (
          <>
            <button
              style={{
                background: "red",
                color: "white",
                padding: "6px 10px",
              }}
              onClick={() => {
                socket.emit("admin:clear");
              }}
            >
              CLEAR MAP
            </button>

            <button
              style={{
                background: "orange",
                color: "white",
                padding: "6px 10px",
                marginLeft: 10,
              }}
              onClick={() => {
                setIsSelecting(true);
                alert("드래그해서 영역을 선택하세요");
              }}
            >
              CLEAR AREA
            </button>
          </>
        )}
      </div>

      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#1f1f1f",
          padding: "10px",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        {PALETTE.map(({ color, name, cost }) => {
          const isUnlocked = unlocked.has(color) || cost === 0;
          const active = color === selectedColor;

          return (
            <button
              key={color}
              onClick={() => {
                if (isUnlocked) {
                  setSelectedColor(color);
                  return;
                }

                if (ink >= cost) {
                  setInk((v) => v - cost);
                  setUnlocked((prev) => {
                    const next = new Set(prev);
                    next.add(color);
                    return next;
                  });
                  setSelectedColor(color);
                } else {
                  alert(`잉크가 부족해요! 필요: ${cost}, 보유: ${ink}`);
                }
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: active ? "3px solid #fff" : "1px solid #666",
                background: color,
                cursor: "pointer",
                boxSizing: "border-box",
                opacity: isUnlocked ? 1 : 0.35,
                position: "relative",
              }}
              title={isUnlocked ? name : `잠김 🔒 (잉크 ${cost} 필요)`}
            >
              {!isUnlocked && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  🔒
                </span>
              )}
            </button>
          );
        })}

        <div style={{ color: "white", marginLeft: 12, alignSelf: "center" }}>
          Ink: <b>{ink}</b>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}>
        Dot: <b>{dot}</b>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, 12px)`,
          width: "fit-content",
          margin: "20px auto",
        }}
      >
        {grid.map((_, index) => {
          const x = index % GRID_SIZE;
          const y = Math.floor(index / GRID_SIZE);
          const key = `${x},${y}`;
          const color = pixels[key] || "#FFFFFF";

          return (
            <div
              key={key}
              onMouseDown={() => {
                if (isSelecting) {
                  setSelectionStart({ x, y });
                } else {
                  setIsDrawing(true);
                  drawPixel(x, y);
                }
              }}
              onMouseEnter={() => {
                if (isSelecting && selectionStart) {
                  setSelectionEnd({ x, y });
                } else if (isDrawing) {
                  drawPixel(x, y);
                }
              }}
              onTouchStart={() => {
                setIsDrawing(true);
                drawPixel(x, y);
              }}
              style={{
                width: 12,
                height: 12,
                backgroundColor: color,
                border:
                  isSelecting &&
                  selectionStart &&
                  selectionEnd &&
                  x >= Math.min(selectionStart.x, selectionEnd.x) &&
                  x <= Math.max(selectionStart.x, selectionEnd.x) &&
                  y >= Math.min(selectionStart.y, selectionEnd.y) &&
                  y <= Math.max(selectionStart.y, selectionEnd.y)
                    ? "1px solid red"
                    : "1px solid #eee",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default App;

//cd C:\Users\아가욱\pixel-world\server
//node index.js
//npm run dev -- --host
