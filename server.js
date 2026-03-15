/*
 * NexMeet — server.js (FIXED VERSION)
 * Handles renegotiation offers that come after screen share
 */

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors    = require("cors");

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.get("/",       (req, res) => res.send("NexMeet Signaling Server is running ✅"));
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

const rooms = {};

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Join room ────────────────────────────────────
  socket.on("join-room", ({ room, name }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = {};

    const existingUsers = Object.entries(rooms[room]).map(([id, data]) => ({
      id, name: data.name,
    }));
    socket.emit("room-users", { users: existingUsers });
    socket.to(room).emit("user-joined", { id: socket.id, name });

    rooms[room][socket.id] = { name };
    console.log(`[room] ${name} joined "${room}" | ${Object.keys(rooms[room]).length} user(s)`);
  });

  // ── WebRTC: offer (also used for renegotiation) ──
  // NOTE: This handles BOTH initial offers AND
  // renegotiation offers triggered by screen share.
  // The receiver's "offer" handler checks signalingState
  // and handles both cases correctly.
  socket.on("offer", ({ to, name, sdp }) => {
    socket.to(to).emit("offer", { from: socket.id, name, sdp });
  });

  // ── WebRTC: answer ───────────────────────────────
  socket.on("answer", ({ to, sdp }) => {
    socket.to(to).emit("answer", { from: socket.id, sdp });
  });

  // ── WebRTC: ICE candidate ────────────────────────
  socket.on("ice-candidate", ({ to, candidate }) => {
    socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // ── Chat ─────────────────────────────────────────
  socket.on("chat-message", ({ room, name, text }) => {
    socket.to(room).emit("chat-message", { name, text });
  });

  // ── Mute status ───────────────────────────────────
  socket.on("mute-status", ({ room, muted }) => {
    socket.to(room).emit("mute-status", { id: socket.id, muted });
  });

  // ── Screen share notifications ───────────────────
  socket.on("screen-share-started", ({ room, name }) => {
    socket.to(room).emit("screen-share-started", { name });
  });

  socket.on("screen-share-stopped", ({ room, name }) => {
    socket.to(room).emit("screen-share-stopped", { name });
  });

  // ── Disconnect ───────────────────────────────────
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (rooms[room]?.[socket.id]) {
        const name = rooms[room][socket.id].name;
        delete rooms[room][socket.id];
        if (Object.keys(rooms[room]).length === 0) delete rooms[room];
        socket.to(room).emit("user-left", { id: socket.id, name });
        console.log(`[-] ${name} left "${room}"`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 NexMeet signaling server running on port ${PORT}\n`);
});
