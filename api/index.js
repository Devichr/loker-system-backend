const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const socketIo = require('socket.io'); // Import socket.io
const app = express();

// Menggunakan dotenv untuk membaca file .env
require('dotenv').config({ path: '.env.development.local' });

app.use(express.json());

// Koneksi ke database PostgreSQL
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

pool.connect(err => {
    if (err) {
        console.error('Connection error:', err.stack);
    } else {
        console.log('Connected to PostgreSQL database');
    }
});

// Membuat server HTTP untuk Socket.io
const server = http.createServer(app);

// Membuat WebSocket Server dengan Socket.io
const io = socketIo(server);

// Menangani koneksi WebSocket dengan Socket.io
io.on('connection', (socket) => {
    console.log('A new WebSocket connection has been established');
    
    // Mengirim pesan ke klien setelah terhubung
    socket.emit('message', 'Hello! You are connected to the WebSocket server.');

    // Menangani ketika koneksi WebSocket ditutup
    socket.on('disconnect', () => {
        console.log('A WebSocket connection has been closed');
    });
});

// Endpoint untuk mendapatkan semua loker beserta statusnya
app.get('/api/lokers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM loker');
        res.status(200).json(result.rows);  // 200: OK
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });  // 500: Internal Server Error
    }
});

// Endpoint untuk mendapatkan status loker tertentu
app.get('/api/lokers/:id', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    if (isNaN(lokerId)) {
        return res.status(400).send({ message: 'Invalid loker ID' });  // 400: Bad Request
    }

    try {
        const result = await pool.query('SELECT * FROM loker WHERE loker_id = $1', [lokerId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });  // 404: Not Found
        }
        res.status(200).json(result.rows[0]);  // 200: OK
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });  // 500: Internal Server Error
    }
});

// Endpoint untuk menambah loker baru
app.post('/api/lokers', async (req, res) => {
    const { status = 'Not Occupied', occupied_by = null } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO loker (status, occupied_by) VALUES ($1, $2) RETURNING *',
            [status, occupied_by]
        );
        res.status(201).send({  // 201: Created
            message: 'Loker added successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });  // 500: Internal Server Error
    }
});

// Endpoint untuk menghapus loker
app.delete('/api/lokers/:id', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    if (isNaN(lokerId)) {
        return res.status(400).send({ message: 'Invalid loker ID' });  // 400: Bad Request
    }

    try {
        const result = await pool.query('DELETE FROM loker WHERE loker_id = $1 RETURNING *', [lokerId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });  // 404: Not Found
        }
        res.status(200).send({  // 200: OK
            message: 'Loker deleted successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });  // 500: Internal Server Error
    }
});

// Endpoint untuk mengupdate status loker berdasarkan tap dari refid
app.put('/api/lokers/:id/tap', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    const { refid } = req.body;

    if (isNaN(lokerId) || !refid) {
        return res.status(400).send({ message: 'Invalid loker ID or missing refid' });  // 400: Bad Request
    }

    try {
        const result = await pool.query('SELECT status, occupied_by FROM loker WHERE loker_id = $1', [lokerId]);

        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });  // 404: Not Found
        }

        const currentStatus = result.rows[0].status;
        const currentOccupiedBy = result.rows[0].occupied_by;

        if (currentStatus === 'Not Occupied') {
            const refidCheck = await pool.query(
                'SELECT * FROM loker WHERE occupied_by = $1 AND status = $2', 
                [refid, 'Occupied']
            );
            if (refidCheck.rows.length > 0) {
                return res.status(403).send({ message: 'This refid is already occupying another loker' });  // 403: Forbidden
            }
        }

        let newStatus, occupiedBy;

        if (currentStatus === 'Not Occupied') {
            newStatus = 'Occupied';
            occupiedBy = refid;
        } else if (currentStatus === 'Occupied') {
            if (currentOccupiedBy !== refid) {
                return res.status(403).send({ message: 'Only the same refid can unlock the loker' });  // 403: Forbidden
            }
            newStatus = 'Not Occupied';
            occupiedBy = null;
        }

        const updateResult = await pool.query(
            'UPDATE loker SET status = $1, occupied_by = $2 WHERE loker_id = $3 RETURNING *',
            [newStatus, occupiedBy, lokerId]
        );

        // Mengirimkan perubahan status ke semua klien yang terhubung melalui WebSocket
        io.emit('loker-status-changed', {
            loker_id: lokerId,
            status: newStatus,
            occupied_by: occupiedBy,
        });

        res.status(200).send({  // 200: OK
            message: 'Loker status updated',
            data: updateResult.rows[0]
        });

    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });  // 500: Internal Server Error
    }
});

// Menjalankan server HTTP dan WebSocket (Socket.io)
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;
