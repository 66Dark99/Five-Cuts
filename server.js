const express = require('express');
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
           });
       });

       // نقطة نهاية: التحقق من توفر الطاولة
       app.post('/reserve', async (req, res) => {
           const { tableNumber } = req.body;
           console.log('Received /reserve request:', req.body);
           if (!tableNumber) {
               console.log('Missing tableNumber');
               return res.status(400).json({ error: 'Table number is required.' });
           }
           try {
               console.log('Checking table:', tableNumber);
               const existingReservation = await pool.query('SELECT id FROM reservations WHERE table_number = $1', [tableNumber]);
               console.log('Query result:', existingReservation.rows);
               if (existingReservation.rows.length > 0) {
                   console.log('Table already reserved:', tableNumber);
                   return res.status(400).json({ error: 'This table is already reserved.' });
               }
               console.log('Table is available:', tableNumber);
               res.status(200).json({ message: 'Table is available.' });
           } catch (error) {
               console.error('Error in /reserve:', error.stack);
               res.status(500).json({ error: 'Failed to check table availability: ' + error.message });
           }
       });

       // نقطة نهاية: إنشاء حجز جديد
       app.post('/create-reservation', async (req, res) => {
           const { tableNumber, username, phoneNumber, items } = req.body;
           console.log('Received /create-reservation request:', req.body);
           if (!tableNumber || !username || !phoneNumber) {
               console.log('Missing required fields');
               return res.status(400).json({ error: 'Table number, username, and phone number are required.' });
           }
           const tableCode = crypto.randomBytes(4).toString('hex');
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
               console.error('Error creating reservation:', error.stack);
               res.status(500).json({ error: 'Failed to create reservation: ' + error.message });
           }
       });

       // نقطة نهاية: تشغيل الخادم
       app.listen(port, () => {
           console.log(`Server is running on port ${port}`);
       });
