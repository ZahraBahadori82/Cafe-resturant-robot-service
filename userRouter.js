// userRouter.js
const express = require('express');
const router = express.Router();
const db = require('./db.js'); // باید متدهای مربوط به users هم داخل db اضافه بشه

// همه‌ی کاربرها
router.get('/all', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get users', error: err.message });
  }
});

// اضافه کردن کاربر
router.post('/add', async (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name || !role) return res.status(400).json({ success: false, message: 'Name and role required' });

    const id = await db.createUser({ name, role });
    res.json({ success: true, id, message: 'User added' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add user', error: err.message });
  }
});

// آپدیت کاربر
router.put('/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;
    await db.updateUser(id, { name, role });
    res.json({ success: true, message: 'User updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update user', error: err.message });
  }
});

// حذف کاربر
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteUser(id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete user', error: err.message });
  }
});

module.exports = router;
