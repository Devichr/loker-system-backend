const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

app.use(express.json());
// Koneksi ke database PostgreSQL
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
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

// Endpoint untuk mengupdate status loker berdasarkan tap dari refid
app.put('/lokers/:id/tap', async (req, res) => {
    const lokerId = parseInt(req.params.id);
    const { refid } = req.body;

    if (isNaN(lokerId)) {
        return res.status(400).send({ message: 'Invalid loker ID' });
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
            // Cek jika refid sudah digunakan di loker lain
            const refidCheck = await pool.query('SELECT * FROM loker WHERE occupied_by = $1 AND status = $2', [refid, 'Occupied']);
            if (refidCheck.rows.length > 0) {
                return res.status(403).send({ message: 'This refid is already occupying another loker' });
            }
        }

        let newStatus, occupiedBy;

        // Jika status loker adalah Not Occupied, maka bisa diubah menjadi Occupied
        if (currentStatus === 'Not Occupied') {
            if (!refid) {
                return res.status(400).send({ message: 'refid is required to occupy the loker' });
            }
            newStatus = 'Occupied';
            occupiedBy = refid;
        } 
        // Jika status loker adalah Occupied, hanya bisa di-tap oleh refid yang sama
        else if (currentStatus === 'Occupied') {
            if (currentOccupiedBy !== refid) {
                return res.status(403).send({ message: 'Only the same refid can unlock the loker' });
            }
            newStatus = 'Not Occupied';
            occupiedBy = null;
        }

        // Update status loker di database
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
