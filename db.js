const express = require('express');
var mysql = require('mysql');

var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    port: '3306',
    database: 'order'
});

connection.connect(function(err) {
    if (err) throw err;
    console.log('🟢 MySQL database connected successfully');
});

// Helper function to process and validate items
function processOrderItems(items) {
    try {
        let parsedItems;
        
        // اگر items یک string است، JSON parse کن
        if (typeof items === 'string') {
            parsedItems = JSON.parse(items);
        } else {
            parsedItems = items;
        }
        
        // اگر array نیست، خطا بده
        if (!Array.isArray(parsedItems)) {
            throw new Error('Items must be an array');
        }
        
        // ترکیب آیتم‌های تکراری (اگر Flutter آیتم‌های جداگانه فرستاده)
        const itemMap = new Map();
        
        parsedItems.forEach(item => {
            const itemName = item.name || item.title || 'نامشخص';
            const itemPrice = parseFloat(item.price || 0);
            const itemQuantity = parseInt(item.quantity || item.count || 1);
            
            if (itemMap.has(itemName)) {
                // آیتم تکراری پیدا شد - quantity را اضافه کن
                const existingItem = itemMap.get(itemName);
                existingItem.quantity += itemQuantity;
                existingItem.totalItemPrice = existingItem.price * existingItem.quantity;
            } else {
                // آیتم جدید
                itemMap.set(itemName, {
                    name: itemName,
                    quantity: itemQuantity,
                    price: itemPrice,
                    totalItemPrice: itemPrice * itemQuantity
                });
            }
        });
        
        // تبدیل Map به Array
        const processedItems = Array.from(itemMap.values());
        
        console.log('🔄 ITEM CONSOLIDATION:');
        console.log('📥 Original items count:', parsedItems.length);
        console.log('📤 Processed items count:', processedItems.length);
        
        return processedItems;
    } catch (error) {
        console.error('❌ Error processing items:', error);
        return [];
    }
}

// Helper function to calculate total price from items
function calculateTotalPrice(items) {
    const processedItems = processOrderItems(items);
    return processedItems.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);
}

// Create new order - با محاسبه درست قیمت
async function createOrder(orderData) {
    return new Promise((resolve, reject) => {
        const { tableId, tableLocation, restaurantId, items } = orderData;
        
        // پردازش آیتم‌ها و محاسبه قیمت کل
        const processedItems = processOrderItems(items);
        const calculatedTotalPrice = calculateTotalPrice(items);
        
        console.log('📝 Processing order with items:', JSON.stringify(processedItems, null, 2));
        console.log('💰 Calculated total price:', calculatedTotalPrice);
        
        const query = `
            INSERT INTO orders (tableId, tableLocation, restaurantId, items, totalPrice, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
        `;
        
        // ذخیره آیتم‌های پردازش شده به صورت JSON
        const itemsJson = JSON.stringify(processedItems);
        const params = [tableId, tableLocation, restaurantId, itemsJson, calculatedTotalPrice];
        
        connection.query(query, params, (err, result) => {
            if (err) {
                console.error('❌ Database error creating order:', err);
                reject(err);
            } else {
                console.log(`✅ Created new order with ID: ${result.insertId}`);
                console.log(`📊 Order details: Table ${tableId}, Total: ${calculatedTotalPrice}, Items count: ${processedItems.length}`);
                resolve(result.insertId);
            }
        });
    });
}

// Get all orders from database - با پردازش بهتر آیتم‌ها
async function getAllOrders() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            ORDER BY created_at DESC
        `;
        
        connection.query(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Database error getting all orders:', err);
                reject(err);
            } else {
                console.log(`📊 Retrieved ${rows.length} orders from database`);
                
                // پردازش آیتم‌ها برای هر سفارش
                const ordersWithParsedItems = rows.map(order => {
                    const parsedItems = processOrderItems(order.items);
                    
                    return {
                        ...order,
                        items: parsedItems,
                        // اضافه کردن تعداد کل آیتم‌ها
                        totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0)
                    };
                });
                
                resolve(ordersWithParsedItems);
            }
        });
    });
}

// Get pending orders (orders that are not completed or cancelled)
async function getPendingOrders() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            WHERE status NOT IN ('completed', 'cancelled', 'delivered') 
            ORDER BY created_at ASC
        `;
        
        connection.query(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Database error getting pending orders:', err);
                reject(err);
            } else {
                console.log(`⏳ Retrieved ${rows.length} pending orders from database`);
                
                // پردازش آیتم‌ها برای سفارشات در انتظار
                const ordersWithParsedItems = rows.map(order => {
                    const parsedItems = processOrderItems(order.items);
                    
                    return {
                        ...order,
                        items: parsedItems,
                        totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0)
                    };
                });
                
                resolve(ordersWithParsedItems);
            }
        });
    });
}

// Get orders by status
async function getOrdersByStatus(status) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            WHERE status = ? 
            ORDER BY created_at DESC
        `;
        
        connection.query(query, [status], (err, rows) => {
            if (err) {
                console.error(`❌ Database error getting orders with status ${status}:`, err);
                reject(err);
            } else {
                console.log(`🔍 Retrieved ${rows.length} orders with status '${status}' from database`);
                
                // پردازش آیتم‌ها
                const ordersWithParsedItems = rows.map(order => {
                    const parsedItems = processOrderItems(order.items);
                    
                    return {
                        ...order,
                        items: parsedItems,
                        totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0)
                    };
                });
                
                resolve(ordersWithParsedItems);
            }
        });
    });
}

// Get recent orders (last N orders)
async function getRecentOrders(limit = 10) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        connection.query(query, [limit], (err, rows) => {
            if (err) {
                console.error('❌ Database error getting recent orders:', err);
                reject(err);
            } else {
                console.log(`📅 Retrieved ${rows.length} recent orders from database`);
                
                // پردازش آیتم‌ها
                const ordersWithParsedItems = rows.map(order => {
                    const parsedItems = processOrderItems(order.items);
                    
                    return {
                        ...order,
                        items: parsedItems,
                        totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0)
                    };
                });
                
                resolve(ordersWithParsedItems);
            }
        });
    });
}

// Get order by ID
async function getOrderById(orderId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM orders 
            WHERE id = ?
        `;
        
        connection.query(query, [orderId], (err, rows) => {
            if (err) {
                console.error('❌ Database error getting order by ID:', err);
                reject(err);
            } else {
                console.log(`🔍 Retrieved order with ID ${orderId}`);
                
                if (rows.length === 0) {
                    resolve(null);
                } else {
                    const order = rows[0];
                    const parsedItems = processOrderItems(order.items);
                    
                    resolve({
                        ...order,
                        items: parsedItems,
                        totalItems: parsedItems.reduce((sum, item) => sum + item.quantity, 0)
                    });
                }
            }
        });
    });
}

// Update order status
async function updateOrderStatus(orderId, newStatus) {
    return new Promise((resolve, reject) => {
        const query = `
            UPDATE orders 
            SET status = ?, updated_at = NOW() 
            WHERE id = ?
        `;
        
        connection.query(query, [newStatus, orderId], (err, result) => {
            if (err) {
                console.error('❌ Database error updating order status:', err);
                reject(err);
            } else {
                console.log(`✅ Updated order ${orderId} status to '${newStatus}'`);
                resolve(result);
            }
        });
    });
}

// User management functions - اصلاح شده برای استفاده از connection
async function getAllUsers() {
    return new Promise((resolve, reject) => {
        const query = 'SELECT * FROM users ORDER BY created_at DESC';
        
        connection.query(query, [], (err, rows) => {
            if (err) {
                console.error('❌ Database error getting users:', err);
                reject(err);
            } else {
                console.log(`👥 Retrieved ${rows.length} users from database`);
                resolve(rows);
            }
        });
    });
}

async function createUser(user) {
    return new Promise((resolve, reject) => {
        const query = 'INSERT INTO users (name, role, created_at, updated_at) VALUES (?, ?, NOW(), NOW())';
        const params = [user.name, user.role];
        
        connection.query(query, params, (err, result) => {
            if (err) {
                console.error('❌ Database error creating user:', err);
                reject(err);
            } else {
                console.log(`✅ Created new user with ID: ${result.insertId}`);
                resolve(result.insertId);
            }
        });
    });
}

async function updateUser(id, user) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE users SET name = ?, role = ?, updated_at = NOW() WHERE id = ?';
        const params = [user.name, user.role, id];
        
        connection.query(query, params, (err, result) => {
            if (err) {
                console.error('❌ Database error updating user:', err);
                reject(err);
            } else {
                console.log(`✅ Updated user ${id}`);
                resolve(result);
            }
        });
    });
}

async function deleteUser(id) {
    return new Promise((resolve, reject) => {
        const query = 'DELETE FROM users WHERE id = ?';
        
        connection.query(query, [id], (err, result) => {
            if (err) {
                console.error('❌ Database error deleting user:', err);
                reject(err);
            } else {
                console.log(`🗑️ Deleted user ${id}`);
                resolve(result);
            }
        });
    });
}

// تابع جدید برای به‌روزرسانی آیتم‌های سفارش
async function updateOrderItems(orderId, newItems) {
    return new Promise((resolve, reject) => {
        const processedItems = processOrderItems(newItems);
        const calculatedTotalPrice = processedItems.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        const query = `
            UPDATE orders 
            SET items = ?, totalPrice = ?, updated_at = NOW() 
            WHERE id = ?
        `;
        
        const itemsJson = JSON.stringify(processedItems);
        const params = [itemsJson, calculatedTotalPrice, orderId];
        
        connection.query(query, params, (err, result) => {
            if (err) {
                console.error('❌ Database error updating order items:', err);
                reject(err);
            } else {
                console.log(`✅ Updated order ${orderId} items and total price to ${calculatedTotalPrice}`);
                resolve(result);
            }
        });
    });
}

// Export both individual functions and the connection
module.exports = {
    // Export the connection for direct use in routes
    query: connection.query.bind(connection),
    
    // Export all async functions
    createOrder,
    getAllOrders,
    getPendingOrders,
    getOrdersByStatus,
    getRecentOrders,
    getOrderById,
    updateOrderStatus,
    updateOrderItems, // تابع جدید
    getAllUsers, 
    createUser, 
    updateUser, 
    deleteUser,
    
    // Export helper functions
    processOrderItems,
    calculateTotalPrice,
    
    // Export the connection itself
    connection: connection
};