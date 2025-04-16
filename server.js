const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// إعدادات الخادم
app.use(express.static(__dirname));
app.use(express.json());
app.use(cors({ origin: 'https://five-cuts.vercel.app', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// كود الأدمن
const ADMIN_CODE = 'admin123';

// إعداد قاعدة بيانات PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
    if (err) {
        console.error('Failed to connect to PostgreSQL database:', err.message);
        process.exit(1);
    }
    console.log('Connected to PostgreSQL database.');

    // إنشاء جدول الحجوزات
    pool.query(`
        CREATE TABLE IF NOT EXISTS reservations (
            id SERIAL PRIMARY KEY,
            table_number VARCHAR(50) NOT NULL,
            username VARCHAR(100) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            item1 TEXT,
            item2 TEXT,
            item3 TEXT,
            item4 TEXT,
            item5 TEXT,
            reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            table_code VARCHAR(50) UNIQUE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating reservations table:', err.message);
        } else {
            console.log('Reservations table ready.');
        }

        // إنشاء فهرس لتحسين البحث
        pool.query('CREATE INDEX IF NOT EXISTS idx_table_code ON reservations (table_code)', (err) => {
            if (err) {
                console.error('Error creating index on table_code:', err.message);
            } else {
                console.log('Index on table_code created.');
            }
        });
    });
});

// نقطة نهاية: التحقق من توفر الطاولة
app.post('/reserve', async (req, res) => {
    const { tableNumber } = req.body;

    if (!tableNumber) {
        console.log('Missing tableNumber:', req.body);
        return res.status(400).json({ error: 'Table number is required.' });
    }

    console.log('Checking table availability:', { tableNumber });

    try {
        const existingReservation = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableNumber]);
        if (existingReservation.rows.length > 0) {
            console.log('Table already reserved:', tableNumber);
            return res.status(400).json({ error: 'This table is already reserved.' });
        }

        console.log('Table is available:', tableNumber);
        res.status(200).json({ message: 'Table is available.' });
    } catch (error) {
        console.error('Error checking table availability:', error.message);
        res.status(500).json({ error: 'Failed to check table availability: ' + error.message });
    }
});

// نقطة نهاية: إنشاء حجز جديد
app.post('/create-reservation', async (req, res) => {
    const { tableNumber, username, phoneNumber, items } = req.body;

    if (!tableNumber || !username || !phoneNumber) {
        console.log('Missing required fields:', { tableNumber, username, phoneNumber });
        return res.status(400).json({ error: 'Table number, username, and phone number are required.' });
    }

    const tableCode = crypto.randomBytes(4).toString('hex');
    console.log('Processing reservation:', { tableNumber, username, phoneNumber, items });

    try {
        const existingReservation = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableNumber]);
        if (existingReservation.rows.length > 0) {
            console.log('Table already reserved:', tableNumber);
            return res.status(400).json({ error: 'This table is already reserved.' });
        }

        const sql = `
            INSERT INTO reservations (table_number, username, phone_number, item1, item2, item3, item4, item5, table_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const params = [
            tableNumber,
            username,
            phoneNumber,
            items?.[0] || null,
            items?.[1] || null,
            items?.[2] || null,
            items?.[3] || null,
            items?.[4] || null,
            tableCode
        ];

        const result = await pool.query(sql, params);
        console.log('Reservation created:', { tableCode });
        res.status(201).json({ message: 'Reservation created successfully', tableCode });
    } catch (error) {
        console.error('Error creating reservation:', error.message);
        res.status(500).json({ error: 'Failed to create reservation: ' + error.message });
    }
});

// نقطة نهاية: جلب الطلبات
app.get('/orders', async (req, res) => {
    const { tableCode } = req.query;
    console.log('Fetching orders:', { tableCode });

    try {
        const sql = tableCode ? 'SELECT * FROM reservations WHERE table_code = $1' : 'SELECT * FROM reservations';
        const params = tableCode ? [tableCode.trim()] : [];
        const result = await pool.query(sql, params);

        if (tableCode && result.rows.length === 0) {
            console.log('No reservation found for tableCode:', tableCode);
            return res.status(404).json({ error: 'No reservation found for this table code.' });
        }

        console.log('Orders retrieved:', result.rows.length);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ error: 'Failed to fetch orders: ' + error.message });
    }
});

// نقطة نهاية: تحديث الحجز
app.put('/update', async (req, res) => {
    const { tableCode, items } = req.body;
    console.log('Processing update:', { tableCode, items });

    if (!tableCode) {
        console.log('Missing tableCode');
        return res.status(400).json({ error: 'Table code is required.' });
    }

    try {
        const sql = `
            UPDATE reservations 
            SET item1 = $1, item2 = $2, item3 = $3, item4 = $4, item5 = $5
            WHERE table_code = $6
            RETURNING *
        `;
        const params = [
            items?.[0] || null,
            items?.[1] || null,
            items?.[2] || null,
            items?.[3] || null,
            items?.[4] || null,
            tableCode.trim()
        ];

        const result = await pool.query(sql, params);
        if (result.rowCount === 0) {
            console.log('No reservation found for update:', tableCode);
            return res.status(404).json({ error: 'Invalid table code or no reservation found.' });
        }

        console.log('Reservation updated:', result.rows[0]);
        res.status(200).json({
            message: 'Reservation updated successfully',
            reservation: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating reservation:', error.message);
        res.status(500).json({ error: 'Failed to update reservation: ' + error.message });
    }
});

// نقطة نهاية: إلغاء الحجز
app.delete('/cancel', async (req, res) => {
    const { tableCode } = req.body;
    console.log('Processing cancellation:', { tableCode });

    if (!tableCode) {
        console.log('Missing tableCode');
        return res.status(400).json({ error: 'Table code is required.' });
    }

    try {
        const result = await pool.query('DELETE FROM reservations WHERE table_code = $1', [tableCode.trim()]);
        if (result.rowCount === 0) {
            console.log('No reservation found for cancellation:', tableCode);
            return res.status(404).json({ error: 'Invalid table code or no reservation found.' });
        }

        console.log('Reservation canceled:', tableCode);
        res.status(200).json({ message: 'Reservation canceled successfully' });
    } catch (error) {
        console.error('Error canceling reservation:', error.message);
        res.status(500).json({ error: 'Failed to cancel reservation: ' + error.message });
    }
});

// نقطة نهاية: عرض جميع الحجوزات للأدمن
app.post('/admin/reservations', async (req, res) => {
    const { adminCode } = req.body;
    console.log('Admin access requested');

    if (adminCode !== ADMIN_CODE) {
        console.log('Invalid admin code');
        return res.status(403).json({ error: 'Invalid admin code.' });
    }

    try {
        const result = await pool.query('SELECT * FROM reservations');
        console.log('Admin reservations retrieved:', result.rows.length);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching admin reservations:', error.message);
        res.status(500).json({ error: 'Failed to fetch reservations: ' + error.message });
    }
});

// نقطة نهاية: تصحيح (للاختبار)
app.get('/debug/reservations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reservations');
        console.log('Debug reservations:', result.rows.length);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Debug error:', error.message);
        res.status(500).json({ error: 'Failed to fetch debug data: ' + error.message });
    }
});

// إغلاق اتصال قاعدة البيانات عند إيقاف الخادم
process.on('SIGINT', async () => {
    await pool.end();
    console.log('Database connection closed.');
    process.exit(0);
});

// تشغيل الخادم
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
