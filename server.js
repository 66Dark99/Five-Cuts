const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());
app.use(cors({ origin: 'https://five-cuts.vercel.app', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
    if (err) {
        console.error('Failed to connect to PostgreSQL:', err.message);
        process.exit(1);
    }
    console.log('Connected to PostgreSQL.');
    pool.query(`
        CREATE TABLE IF NOT EXISTS reservations (
            id SERIAL PRIMARY KEY,
            table_number VARCHAR(50) NOT NULL,
            username VARCHAR(100) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            items JSONB,
            reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Reservations table checked/created.');
            // إضافة عمود reservation_time إذا لم يكن موجودًا
            pool.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'reservations'
                        AND column_name = 'reservation_time'
                    ) THEN
                        ALTER TABLE reservations
                        ADD COLUMN reservation_time TIMESTAMP;
                    END IF;
                END
                $$;
            `, (err) => {
                if (err) {
                    console.error('Error adding reservation_time column:', err.message);
                } else {
                    console.log('reservation_time column checked/added.');
                }
            });
        }
    });
});

app.post('/reserve', async (req, res) => {
    const { tableNumber } = req.body;
    console.log('Received /reserve:', req.body);
    if (!tableNumber) {
        return res.status(400).json({ error: 'Table number is required.' });
    }
    try {
        const result = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableNumber]);
        if (result.rows.length > 0) {
            return res.status(400).json({ error: 'This table is already reserved.' });
        }
        res.status(200).json({ message: 'Table is available.' });
    } catch (error) {
        console.error('Error in /reserve:', error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

app.post('/create-reservation', async (req, res) => {
    const { tableNumber, username, phoneNumber, reservationTime, items } = req.body;
    console.log('Received /create-reservation:', req.body);
    if (!tableNumber || !username || !phoneNumber || !reservationTime || !items) {
        return res.status(400).json({ error: 'Table number, username, phone number, reservation time, and items are required.' });
    }
    try {
        const result = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableNumber]);
        if (result.rows.length > 0) {
            return res.status(400).json({ error: 'This table is already reserved.' });
        }
        await pool.query(
            'INSERT INTO reservations (table_number, username, phone_number, reservation_time, items) VALUES ($1, $2, $3, $4, $5)',
            [tableNumber, username, phoneNumber, reservationTime, JSON.stringify(items)]
        );
        res.status(201).json({ message: 'Reservation created successfully.' });
    } catch (error) {
        console.error('Error in /create-reservation:', error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

app.get('/orders', async (req, res) => {
    const { tableCode } = req.query;
    console.log('Received /orders:', { tableCode });
    try {
        // نستخدم table_number مؤقتًا بدلاً من tableCode
        const result = await pool.query('SELECT * FROM reservations WHERE table_number = $1', [tableCode]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error in /orders:', error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

app.put('/update', async (req, res) => {
    const { tableCode, tableNumber, username, phoneNumber, reservationTime, items } = req.body;
    console.log('Received /update:', req.body);
    if (!tableCode || !tableNumber || !username || !phoneNumber || !reservationTime || !items) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const result = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableCode]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found.' });
        }
        await pool.query(
            'UPDATE reservations SET table_number = $1, username = $2, phone_number = $3, reservation_time = $4, items = $5 WHERE table_number = $6',
            [tableNumber, username, phoneNumber, reservationTime, JSON.stringify(items), tableCode]
        );
        res.status(200).json({ message: 'Reservation updated successfully.' });
    } catch (error) {
        console.error('Error in /update:', error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

app.delete('/cancel', async (req, res) => {
    const { tableCode } = req.body;
    console.log('Received /cancel:', { tableCode });
    if (!tableCode) {
        return res.status(400).json({ error: 'Table code is required.' });
    }
    try {
        const result = await pool.query('DELETE FROM reservations WHERE table_number = $1', [tableCode]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservation not found.' });
        }
        res.status(200).json({ message: 'Reservation canceled successfully.' });
    } catch (error) {
        console.error('Error in /cancel:', error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
