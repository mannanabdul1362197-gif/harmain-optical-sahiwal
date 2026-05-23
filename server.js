const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'harmain_secret_key';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const db = new sqlite3.Database('harmain_optical.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT DEFAULT 'general',
    image_url TEXT,
    stock INTEGER DEFAULT 10,
    featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    product_id INTEGER,
    product_snapshot TEXT,
    prescription_data TEXT,
    lens_options TEXT,
    total_price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS lens_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    price REAL NOT NULL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Default admin
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const defaultAdminPass = 'admin123';
  const hashedPass = bcrypt.hashSync(defaultAdminPass, 10);
  db.get(`SELECT id FROM users WHERE username = ?`, [adminUsername], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [adminUsername, hashedPass]);
      console.log('Default admin: admin / admin123');
    }
  });

  // Sample products
  db.get(`SELECT id FROM products LIMIT 1`, [], (err, row) => {
    if (!row) {
      const sample = [
        ['Classic Aviator Gold', 'Premium metal aviator frames', 2499, 'men', 'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=400', 15, 1],
        ['Retro Square Black', 'Vintage square frames', 1899, 'women', 'https://images.unsplash.com/photo-1591076482161-42ce6da69f1a?w=400', 20, 1],
        ['Blue Light Blocking', 'Reduce eye strain', 2999, 'computer', 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400', 12, 1],
        ['Polarized Sunglasses', 'UV400 protection', 1599, 'sunglasses', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400', 25, 0],
        ['Kids Flexible Frame', 'Durable for children', 1299, 'kids', 'https://images.unsplash.com/photo-1544960052-d10cbea2c6c5?w=400', 30, 0],
        ['Premium Progressive', 'No-line bifocal', 4999, 'premium', 'https://images.unsplash.com/photo-1532235646470-3b6b7f962bef?w=400', 8, 1]
      ];
      const stmt = db.prepare(`INSERT INTO products (name, description, price, category, image_url, stock, featured) VALUES (?,?,?,?,?,?,?)`);
      sample.forEach(p => stmt.run(p));
      stmt.finalize();
    }
  });

  // Default lens types
  db.get(`SELECT id FROM lens_types LIMIT 1`, [], (err, row) => {
    if (!row) {
      const lenses = [
        ['Glass', 0, 1],
        ['Plastic', 300, 1],
        ['Blue Cut', 800, 1],
        ['Photosun', 1200, 1]
      ];
      const stmt = db.prepare(`INSERT INTO lens_types (name, price, is_active) VALUES (?, ?, ?)`);
      lenses.forEach(l => stmt.run(l));
      stmt.finalize();
    }
  });
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  });
});

// Public products
app.get('/api/products', (req, res) => {
  let sql = `SELECT * FROM products WHERE 1=1`;
  const params = [];
  if (req.query.category && req.query.category !== 'all') {
    sql += ` AND category = ?`;
    params.push(req.query.category);
  }
  if (req.query.featured === 'true') sql += ` AND featured = 1`;
  sql += ` ORDER BY created_at DESC`;
  db.all(sql, params, (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(products);
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get(`SELECT * FROM products WHERE id = ?`, [req.params.id], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  });
});

// Admin product CRUD with JSON (for ImgBB)
app.post('/api/products/json', authenticateToken, (req, res) => {
  const { id, name, description, price, category, image_url, stock, featured } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  if (id) {
    db.run(`UPDATE products SET name=?, description=?, price=?, category=?, image_url=?, stock=?, featured=? WHERE id=?`,
      [name, description, price, category, image_url, stock, featured, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated' });
      });
  } else {
    db.run(`INSERT INTO products (name, description, price, category, image_url, stock, featured) VALUES (?,?,?,?,?,?,?)`,
      [name, description, price, category, image_url, stock, featured],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Added' });
      });
  }
});

app.delete('/api/products/:id', authenticateToken, (req, res) => {
  db.run(`DELETE FROM products WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

// Orders
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_phone, customer_address, product_id, product_snapshot, prescription_data, lens_options, total_price } = req.body;
  if (!customer_name || !customer_phone || !total_price) return res.status(400).json({ error: 'Missing fields' });
  const order_number = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  db.run(`INSERT INTO orders (order_number, customer_name, customer_phone, customer_address, product_id, product_snapshot, prescription_data, lens_options, total_price) VALUES (?,?,?,?,?,?,?,?,?)`,
    [order_number, customer_name, customer_phone, customer_address, product_id || null, JSON.stringify(product_snapshot), JSON.stringify(prescription_data), JSON.stringify(lens_options), total_price],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ order_number, message: 'Order placed' });
    });
});

app.get('/api/orders', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY created_at DESC`, [], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = orders.map(o => ({
      ...o,
      product_snapshot: o.product_snapshot ? JSON.parse(o.product_snapshot) : null,
      prescription_data: o.prescription_data ? JSON.parse(o.prescription_data) : null,
      lens_options: o.lens_options ? JSON.parse(o.lens_options) : null
    }));
    res.json(parsed);
  });
});

app.patch('/api/orders/:id/status', authenticateToken, (req, res) => {
  const { status } = req.body;
  db.run(`UPDATE orders SET status=? WHERE id=?`, [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Updated' });
  });
});

app.get('/api/admin/stats', authenticateToken, (req, res) => {
  db.get(`SELECT COUNT(*) as total_products FROM products`, [], (err, p) => {
    db.get(`SELECT COUNT(*) as total_orders FROM orders`, [], (err, o) => {
      db.get(`SELECT COALESCE(SUM(total_price),0) as total_revenue FROM orders WHERE status != 'cancelled'`, [], (err, rev) => {
        db.get(`SELECT COUNT(*) as pending_orders FROM orders WHERE status='pending'`, [], (err, pend) => {
          res.json({ products: p.total_products, orders: o.total_orders, revenue: rev.total_revenue, pending: pend.pending_orders });
        });
      });
    });
  });
});

// Lens types
app.get('/api/lens-types', (req, res) => {
  const { all } = req.query;
  let sql = all === 'true' ? `SELECT * FROM lens_types` : `SELECT * FROM lens_types WHERE is_active = 1`;
  sql += ` ORDER BY price ASC`;
  db.all(sql, [], (err, lenses) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(lenses);
  });
});

app.get('/api/lens-types/:id', authenticateToken, (req, res) => {
  db.get(`SELECT * FROM lens_types WHERE id = ?`, [req.params.id], (err, lens) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!lens) return res.status(404).json({ error: 'Not found' });
    res.json(lens);
  });
});

app.post('/api/lens-types', authenticateToken, (req, res) => {
  const { name, price, is_active } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Name and price required' });
  db.run(`INSERT INTO lens_types (name, price, is_active) VALUES (?, ?, ?)`,
    [name, price, is_active !== undefined ? is_active : 1],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Lens type added' });
    });
});

app.put('/api/lens-types/:id', authenticateToken, (req, res) => {
  const { name, price, is_active } = req.body;
  db.run(`UPDATE lens_types SET name=?, price=?, is_active=? WHERE id=?`,
    [name, price, is_active, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated' });
    });
});

app.delete('/api/lens-types/:id', authenticateToken, (req, res) => {
  db.run(`DELETE FROM lens_types WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

// Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));