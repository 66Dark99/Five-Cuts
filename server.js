const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = 3000;

// إعدادات الخادم
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// كود الأدمن (يُفضل استخدام متغير بيئي في الإنتاج)
const ADMIN_CODE = 'admin123';

// إعداد قاعدة البيانات
const db = new sqlite3.Database('./reservations.db', (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');

    // إنشاء جدول الحجوزات
    db.run(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number TEXT NOT NULL,
            username TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            item1 TEXT,
            item2 TEXT,
            item3 TEXT,
            item4 TEXT,
            item5 TEXT,
            reservation_date TEXT DEFAULT (datetime('now')),
            table_code TEXT UNIQUE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating reservations table:', err.message);
        } else {
            console.log('Reservations table ready.');
        }

        // إنشاء فهرس لتحسين البحث باستخدام table_code
        db.run('CREATE INDEX IF NOT EXISTS idx_table_code ON reservations (table_code)', (err) => {
            if (err) {
                console.error('Error creating index on table_code:', err.message);
            } else {
                console.log('Index on table_code created.');
            }
        });
    });
});

// نقطة نهاية: إنشاء حجز جديد
app.post('/reserve', async (req, res) => {
    const { tableNumber, username, phoneNumber, items } = req.body;

    // التحقق من البيانات المطلوبة
    if (!tableNumber || !username || !phoneNumber) {
        console.log('Missing required fields:', { tableNumber, username, phoneNumber });
        return res.status(400).json({ error: 'Table number, username, and phone number are required.' });
    }

    const tableCode = crypto.randomBytes(4).toString('hex');
    console.log('Processing reservation:', { tableNumber, username, phoneNumber, items });

    try {
        // التحقق من توفر الطاولة
        const existingReservation = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM reservations WHERE table_number = ?', [tableNumber], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (existingReservation) {
            console.log('Table already reserved:', tableNumber);
            return res.status(400).json({ error: 'This table is already reserved.' });
        }

        // إدراج الحجز
        const sql = `
            INSERT INTO reservations (table_number, username, phone_number, item1, item2, item3, item4, item5, table_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        await new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                resolve();
            });
        });

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
        const sql = tableCode ? 'SELECT * FROM reservations WHERE table_code = ?' : 'SELECT * FROM reservations';
        const params = tableCode ? [tableCode.trim()] : [];

        const rows = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        if (tableCode && rows.length === 0) {
            console.log('No reservation found for tableCode:', tableCode);
            return res.status(404).json({ error: 'No reservation found for this table code.' });
        }

        console.log('Orders retrieved:', rows.length);
        res.status(200).json(rows);
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
            SET item1 = ?, item2 = ?, item3 = ?, item4 = ?, item5 = ?
            WHERE table_code = ?
        `;
        const params = [
            items?.[0] || null,
            items?.[1] || null,
            items?.[2] || null,
            items?.[3] || null,
            items?.[4] || null,
            tableCode.trim()
        ];

        const result = await new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                resolve(this.changes);
            });
        });

        if (result === 0) {
            console.log('No reservation found for update:', tableCode);
            return res.status(404).json({ error: 'Invalid table code or no reservation found.' });
        }

        // جلب البيانات المحدثة
        const updatedReservation = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM reservations WHERE table_code = ?', [tableCode.trim()], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!updatedReservation) {
            console.log('Failed to retrieve updated reservation:', tableCode);
            return res.status(500).json({ error: 'Failed to retrieve updated reservation.' });
        }

        console.log('Reservation updated:', updatedReservation);
        res.status(200).json({
            message: 'Reservation updated successfully',
            reservation: updatedReservation
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
        const result = await new Promise((resolve, reject) => {
            db.run('DELETE FROM reservations WHERE table_code = ?', [tableCode.trim()], function (err) {
                if (err) reject(err);
                resolve(this.changes);
            });
        });

        if (result === 0) {
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
        const rows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM reservations', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        console.log('Admin reservations retrieved:', rows.length);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching admin reservations:', error.message);
        res.status(500).json({ error: 'Failed to fetch reservations: ' + error.message });
    }
});

// نقطة نهاية: تصحيح (للاختبار)
app.get('/debug/reservations', async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM reservations', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        console.log('Debug reservations:', rows.length);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Debug error:', error.message);
        res.status(500).json({ error: 'Failed to fetch debug data: ' + error.message });
    }
});

// إغلاق قاعدة البيانات عند إيقاف الخادم
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});

// تشغيل الخادم
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});