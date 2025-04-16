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
                   reservation_time TIMESTAMP NOT NULL,
                   items JSONB,
                   reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
               )
           `, (err) => {
               if (err) {
                   console.error('Error creating table:', err.message);
               } else {
                   console.log('Reservations table ready.');
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

       app.listen(port, () => {
           console.log(`Server is running on port ${port}`);
       });
