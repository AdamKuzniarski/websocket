import { timeStamp } from "console";
import express from "express";
import http from "http";
import { text } from "stream/consumers";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
const server = http.createServer(app);

// static Files (Frontend) aus /public
app.use(express.static("public"));

// WebSocket
const wss = new WebSocketServer({ server, path: "/ws" });

type ClientMeta = {
  username: string;
  room: string;
};

type IncomingMessage =
  | { type: "join"; username: string; room: string }
  | { type: "message"; content: string };

const clients = new Map<WebSocket, ClientMeta>();

function broadcastToRoom(room: string, data: unknown) {
  const payload = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    const meta = clients.get(client);
    if (!meta || meta.room != room) return;

    client.send(payload);
  });
}

// Verbindung
wss.on("connection", (socket: WebSocket) => {
  console.log("New client connected");

  socket.on("message", (msg) => {
    try {
      const raw = msg.toString();
      const parsed = JSON.parse(raw) as IncomingMessage;

      if (parsed.type === "join") {
        const username = parsed.username?.trim();
        const room = parsed.room?.trim() || "general";

        if (!username) {
          socket.send(
            JSON.stringify({
              type: "system",
              text: "Username is required to join.",
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        clients.set(socket, { username, room });
        console.log(`Client joined room="${room}" as "${username}"`);

        broadcastToRoom(room, {
          type: "system",
          text: `${username} joined the room`,
          room,
          timestamp: new Date().toISOString(),
        });
      } else if (parsed.type === "message") {
        const meta = clients.get(socket);
        if (!meta) {
          socket.send(
            JSON.stringify({
              type: "system",
              text: "Join a room before sending messages.",
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        const messageText = parsed.text?.trim();
        if (!messageText) return;

        const { username, room } = meta;
        const timestamp = new Date().toISOString();

        broadcastToRoom(room, {
          type: "message",
          username,
          text: messageText,
          room,
          timestamp,
        });
      }
    } catch (err) {
      console.error("Error handling message:", err);
      socket.send(
        JSON.stringify({
          type: "system",
          text: "Invalid message format.",
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  socket.on("close", () => {
    const meta = clients.get(socket);
    if (meta) {
      clients.delete(socket);
      broadcastToRoom(meta.room, {
        type: "system",
        text: `${meta.username} left the room`,
        room: meta.room,
        timestamp: new Date().toISOString(),
      });
    }
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
  console.log(`WebSocket server is running at ws://localhost:${PORT}/ws`);
});
