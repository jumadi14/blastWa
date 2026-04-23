import db from "./db.js";

export async function createUser(username, password, role = "user") {
    await db.run(
        `INSERT INTO Users (username, password, role, createdAt) VALUES (?, ?, ?, ?)`,
        [username, password, role, Math.floor(Date.now() / 1000)]
    );
}

export async function getUserByUsername(username) {
    return await db.get(`SELECT * FROM Users WHERE username = ?`, [username]);
}

export async function listUsers() {
    return await db.all(`SELECT id, username, role, createdAt FROM Users`);
}

export async function linkDeviceToUser(deviceId, userId) {
    await db.run(`UPDATE Devices SET ownerId = ? WHERE deviceId = ?`, [userId, deviceId]);
}

