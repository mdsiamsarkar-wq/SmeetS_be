/*
 * NexMeet — server.js (FIXED VERSION)
 * Node.js + Socket.io Signaling Server
 *
 * Added:
 *  - screen-share-started relay
 *  - screen-share-stopped relay
 */

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors    = require("cors");

// ── App setup ────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.get("/",       (req, res) => res.send("NexMeet Signaling Server is running ✅"));
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ── In-memory room store ─────────────────────────────
// rooms = { roomId: { socketId: { name } } }
const rooms = {};

// ── Socket.io logic ──────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Join a room ──────────────────────────────────
  socket.on("join-room", ({ room, name }) => {
    socket.join(room);

    if (!rooms[room]) rooms[room] = {};

    // Tell the newcomer about existing users
    const existingUsers = Object.entries(rooms[room]).map(([id, data]) => ({
      id,
      name: data.name,
    }));
    socket.emit("room-users", { users: existingUsers });

    // Tell existing users about the newcomer
    socket.to(room).emit("user-joined", { id: socket.id, name });

    // Register user in room
    rooms[room][socket.id] = { name };

    console.log(`[room] ${name} (${socket.id}) joined "${room}" | ${Object.keys(rooms[room]).length} user(s)`);
  });

  // ── WebRTC Signaling: relay offer ────────────────
  socket.on("offer", ({ to, name, sdp }) => {
    socket.to(to).emit("offer", { from: socket.id, name, sdp });
  });

  // ── WebRTC Signaling: relay answer ──────────────
  socket.on("answer", ({ to, sdp }) => {
    socket.to(to).emit("answer", { from: socket.id, sdp });
  });

  // ── WebRTC Signaling: relay ICE candidate ───────
  socket.on("ice-candidate", ({ to, candidate }) => {
    socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // ── Chat message ─────────────────────────────────
  socket.on("chat-message", ({ room, name, text }) => {
    socket.to(room).emit("chat-message", { name, text });
  });

  // ── Mute status ───────────────────────────────────
  socket.on("mute-status", ({ room, muted }) => {
    socket.to(room).emit("mute-status", { id: socket.id, muted });
  });

  // ── Screen share started ─────────────────────────
  socket.on("screen-share-started", ({ room, name }) => {
    socket.to(room).emit("screen-share-started", { name });
  });

  // ── Screen share stopped ─────────────────────────
  socket.on("screen-share-stopped", ({ room, name }) => {
    socket.to(room).emit("screen-share-stopped", { name });
  });

  // ── Disconnect ───────────────────────────────────
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (rooms[room] && rooms[room][socket.id]) {
        const name = rooms[room][socket.id].name;
        delete rooms[room][socket.id];
        if (Object.keys(rooms[room]).length === 0) {
          delete rooms[room];
        }
        socket.to(room).emit("user-left", { id: socket.id, name });
        console.log(`[-] ${name} (${socket.id}) left "${room}"`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ── Start server ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 NexMeet signaling server running on port ${PORT}\n`);
});
