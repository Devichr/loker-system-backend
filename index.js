const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

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

// Endpoint untuk mendapatkan semua loker beserta statusnya
app.get('/lokers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM loker');
        res.json(result.rows);
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });
    }
});

// Endpoint untuk mendapatkan status loker tertentu
app.get('/lokers/:id', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    if (isNaN(lokerId)) {
        return res.status(400).send({ message: 'Invalid loker ID' });
    }

    try {
        const result = await pool.query('SELECT * FROM loker WHERE loker_id = $1', [lokerId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });
    }
});

// Endpoint untuk menambah loker baru
app.post('/lokers', async (req, res) => {
    const { loker_id, status = 'Not Occupied', occupied_by = null } = req.body;

    if (!loker_id || typeof loker_id !== 'number') {
        return res.status(400).send({ message: 'Invalid or missing loker_id' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO loker (loker_id, status, occupied_by) VALUES ($1, $2, $3) RETURNING *',
            [loker_id, status, occupied_by]
        );
        res.status(201).send({
            message: 'Loker added successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });
    }
});

// Endpoint untuk menghapus loker
app.delete('/lokers/:id', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    if (isNaN(lokerId)) {
        return res.status(400).send({ message: 'Invalid loker ID' });
    }

    try {
        const result = await pool.query('DELETE FROM loker WHERE loker_id = $1 RETURNING *', [lokerId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });
        }
        res.send({
            message: 'Loker deleted successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });
    }
});

// Endpoint untuk mengupdate status loker berdasarkan tap dari refid
app.put('/lokers/:id/tap', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    const { refid } = req.body;

    if (isNaN(lokerId) || !refid) {
        return res.status(400).send({ message: 'Invalid loker ID or missing refid' });
    }

    try {
        // Cek status loker saat ini
        const result = await pool.query('SELECT status, occupied_by FROM loker WHERE loker_id = $1', [lokerId]);

        if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Loker not found' });
        }

        const currentStatus = result.rows[0].status;
        const currentOccupiedBy = result.rows[0].occupied_by;

        // Cek apakah refid sudah digunakan di loker lain yang statusnya "Occupied"
        if (currentStatus === 'Not Occupied') {
            const refidCheck = await pool.query(
                'SELECT * FROM loker WHERE occupied_by = $1 AND status = $2', 
                [refid, 'Occupied']
            );
            if (refidCheck.rows.length > 0) {
                return res.status(403).send({ message: 'This refid is already occupying another loker' });
            }
        }

        let newStatus, occupiedBy;

        if (currentStatus === 'Not Occupied') {
            newStatus = 'Occupied';
            occupiedBy = refid;
        } else if (currentStatus === 'Occupied') {
            if (currentOccupiedBy !== refid) {
                return res.status(403).send({ message: 'Only the same refid can unlock the loker' });
            }
            newStatus = 'Not Occupied';
            occupiedBy = null;
        }

        const updateResult = await pool.query(
            'UPDATE loker SET status = $1, occupied_by = $2 WHERE loker_id = $3 RETURNING *',
            [newStatus, occupiedBy, lokerId]
        );

        res.send({
            message: 'Loker status updated',
            data: updateResult.rows[0]
        });

    } catch (err) {
        console.error("Database error:", err.message);
        res.status(500).send({ error: 'Database error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});