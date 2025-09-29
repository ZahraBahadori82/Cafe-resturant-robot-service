

const express = require('express');
const router = express.Router();
const db = require('./db.js');

console.log('📋 Order router loaded successfully');

// برای دسترسی به io و MQTT service از index.js
let io;
let mqttService;

// تابع برای تنظیم io reference
function setSocketIO(socketIo) {
    io = socketIo;
    console.log('✅ Socket.IO reference set in order router');
}

// تابع برای تنظیم MQTT service reference
function setMQTTService(service) {
    mqttService = service;
    console.log('✅ MQTT Service reference set in order router');
}

// ========== VALIDATION HELPERS ==========

function validateOrderData(data) {
    const { tableId, items, totalPrice } = data;
    
    if (!tableId) {
        return { valid: false, message: 'Table ID is required' };
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return { valid: false, message: 'Items array is required and cannot be empty' };
    }
    
    if (!totalPrice || totalPrice <= 0) {
        return { valid: false, message: 'Total price must be greater than 0' };
    }
    
    return { valid: true };
}

// ========== ROUTES ==========

// Test route
router.get('/test', (req, res) => {
    console.log('✅ Order router test endpoint hit');
    res.json({ 
        success: true, 
        message: 'Order router is working!',
        timestamp: new Date().toISOString(),
        mqtt_connected: mqttService ? mqttService.isConnected : false
    });
});

// Submit new order
router.post('/submit', async (req, res) => {
    console.log('🎯 POST /submit - New order submission');
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { tableId, tableLocation, restaurantId, items, totalPrice } = req.body;
        
        // Validate required fields
        const validation = validateOrderData({ tableId, items, totalPrice });
        if (!validation.valid) {
            console.log('❌ Validation failed:', validation.message);
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        // پردازش آیتم‌ها و اصلاح quantity
        let processedItems = items;
        if (Array.isArray(items)) {
            processedItems = items.map(item => ({
                name: item.name || item.title || 'نامشخص',
                quantity: item.quantity || item.count || 1,
                price: parseFloat(item.price || 0)
            }));
        }
        
        // تبدیل آیتم‌ها به string برای ذخیره در دیتابیس
        const itemsString = JSON.stringify(processedItems);
        
        // Create order data object
        const orderData = {
            tableId: tableId,
            tableLocation: tableLocation || null,
            restaurantId: restaurantId || null,
            items: itemsString,
            totalPrice: parseFloat(totalPrice)
        };
        
        console.log('📝 Prepared order data:', orderData);
        
        // Use the async database method
        const orderId = await db.createOrder(orderData);
        
        console.log('✅ Order created successfully with ID:', orderId);
        
        // دریافت سفارش کامل از دیتابیس
        const fullOrder = await db.getOrderById(orderId);
        
        // ارسال سفارش جدید به MQTT (فقط اطلاع‌رسانی، نه ارسال به ربات)
        if (mqttService && mqttService.isConnected) {
            try {
                await mqttService.publishNewOrder(fullOrder);
                console.log('📡 New order published to MQTT');
            } catch (error) {
                console.error('❌ Failed to publish new order to MQTT:', error);
            }
        }
        
        // ارسال اعلان سفارش جدید به کلاینت‌ها از طریق WebSocket
        if (io) {
            io.emit('new_order_created', {
                order: fullOrder,
                message: 'سفارش جدید دریافت شد!'
            });
            console.log('📡 New order notification sent via WebSocket');
        }
        
        res.status(201).json({
            success: true,
            message: 'سفارش با موفقیت ثبت شد',
            orderId: orderId,
            orderData: {
                id: orderId,
                tableId,
                tableLocation,
                restaurantId,
                items: processedItems,
                totalPrice: parseFloat(totalPrice),
                status: 'pending'
            }
        });
        
    } catch (error) {
        console.error('❌ Error submitting order:', error);
        console.error('❌ Error stack:', error.stack);
        
        // More detailed error response
        let errorMessage = 'Failed to save order';
        if (error.code === 'ER_NO_SUCH_TABLE') {
            errorMessage = 'Database table not found. Please check database setup.';
        } else if (error.code === 'ER_BAD_FIELD_ERROR') {
            errorMessage = 'Database column mismatch. Please check table structure.';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Database connection failed. Please check database server.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Get all orders
router.get('/all', async (req, res) => {
    console.log('📋 GET /all - Retrieving all orders');
    
    try {
        const orders = await db.getAllOrders();
        
        console.log(`✅ Retrieved ${orders.length} orders from database`);
        
        // ارسال تمام سفارش‌ها به MQTT برای بروزرسانی
        if (mqttService && mqttService.isConnected) {
            try {
                await mqttService.publishAllOrders(orders);
                console.log('📡 All orders published to MQTT');
            } catch (error) {
                console.error('❌ Failed to publish all orders to MQTT:', error);
            }
        }
        
        res.json({
            success: true,
            count: orders.length,
            orders: orders
        });
        
    } catch (error) {
        console.error('❌ Error retrieving orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders',
            error: error.message
        });
    }
});

// Get orders by status
router.get('/status/:status', async (req, res) => {
    console.log(`📋 GET /status/${req.params.status} - Getting orders by status`);
    
    try {
        const { status } = req.params;
        const orders = await db.getOrdersByStatus(status);
        
        console.log(`✅ Retrieved ${orders.length} orders with status '${status}'`);
        
        res.json({
            success: true,
            status: status,
            count: orders.length,
            orders: orders
        });
        
    } catch (error) {
        console.error('❌ Error retrieving orders by status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders by status',
            error: error.message
        });
    }
});

// Get pending orders
router.get('/pending', async (req, res) => {
    console.log('⏳ GET /pending - Getting pending orders');
    
    try {
        const pendingOrders = await db.getPendingOrders();
        
        console.log(`✅ Retrieved ${pendingOrders.length} pending orders`);
        
        // ارسال سفارش‌های در انتظار به MQTT
        if (mqttService && mqttService.isConnected) {
            try {
                await mqttService.publishPendingOrders(pendingOrders);
                console.log('📡 Pending orders published to MQTT');
            } catch (error) {
                console.error('❌ Failed to publish pending orders to MQTT:', error);
            }
        }
        
        res.json({
            success: true,
            count: pendingOrders.length,
            orders: pendingOrders
        });
        
    } catch (error) {
        console.error('❌ Error retrieving pending orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve pending orders',
            error: error.message
        });
    }
});

// Get recent orders
router.get('/recent', async (req, res) => {
    console.log('📅 GET /recent - Getting recent orders');
    
    try {
        const limit = parseInt(req.query.limit) || 10;
        const recentOrders = await db.getRecentOrders(limit);
        
        console.log(`✅ Retrieved ${recentOrders.length} recent orders`);
        
        res.json({
            success: true,
            limit: limit,
            count: recentOrders.length,
            orders: recentOrders
        });
        
    } catch (error) {
        console.error('❌ Error retrieving recent orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve recent orders',
            error: error.message
        });
    }
});

// Get specific order by ID
router.get('/:orderId', async (req, res) => {
    console.log(`🔍 GET /${req.params.orderId} - Getting specific order`);
    
    try {
        const { orderId } = req.params;
        const order = await db.getOrderById(orderId);
        
        if (!order) {
            console.log(`❌ Order ${orderId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        console.log(`✅ Retrieved order ${orderId}`);
        
        res.json({
            success: true,
            order: order
        });
        
    } catch (error) {
        console.error('❌ Error retrieving order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve order',
            error: error.message
        });
    }
});

// Update order status - این قسمت مهم است!
router.put('/:orderId/status', async (req, res) => {
    console.log(`🔄 PUT /${req.params.orderId}/status - Updating order status`);
    
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        // بررسی وضعیت‌های مجاز
        const allowedStatuses = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Allowed: ' + allowedStatuses.join(', ')
            });
        }
        
        // Check if order exists
        const existingOrder = await db.getOrderById(orderId);
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        const oldStatus = existingOrder.status;
        await db.updateOrderStatus(orderId, status);
        
        console.log(`✅ Updated order ${orderId} status from '${oldStatus}' to '${status}'`);
        
        // دریافت سفارش آپدیت شده
        const updatedOrder = await db.getOrderById(orderId);
        
        // ارسال تغییر وضعیت به MQTT
        if (mqttService && mqttService.isConnected) {
            try {
                await mqttService.publishOrderStatusUpdate(orderId, oldStatus, status);
                console.log('📡 Order status update published to MQTT');
            } catch (error) {
                console.error('❌ Failed to publish status update to MQTT:', error);
            }
        }
        
        // 🚨 منطق مهم: فقط وقتی وضعیت به 'ready' تغییر کرد، سفارش را برای ربات ارسال کن
        if (status === 'ready' && mqttService && mqttService.isConnected) {
            try {
                console.log(`🤖 Status changed to 'ready' - Sending order ${orderId} to robot`);
                
                // ساخت داده‌های سفارش برای ربات
                const robotOrderData = {
                    id: updatedOrder.id,
                    table_id: updatedOrder.tableId,
                    table_location: updatedOrder.tableLocation || `Table ${updatedOrder.tableId} Location`,
                    items: typeof updatedOrder.items === 'string' ? 
                           JSON.parse(updatedOrder.items || '[]') : updatedOrder.items,
                    total_price: updatedOrder.totalPrice,
                    priority: 'normal',
                    created_at: updatedOrder.created_at,
                    status: updatedOrder.status
                };
                
                await mqttService.sendOrderToRobot(robotOrderData);
                console.log(`🚀 Order #${orderId} successfully sent to robot via MQTT`);
                
                // اطلاع‌رسانی موفقیت ارسال به ربات
                if (io) {
                    io.emit('order_sent_to_robot', {
                        success: true,
                        orderId: orderId,
                        message: `سفارش #${orderId} برای ربات ارسال شد`,
                        timestamp: new Date().toISOString()
                    });
                }
                
            } catch (error) {
                console.error(`❌ Failed to send order ${orderId} to robot:`, error);
                
                // اطلاع‌رسانی خطا در ارسال به ربات
                if (io) {
                    io.emit('order_sent_to_robot', {
                        success: false,
                        orderId: orderId,
                        error: error.message,
                        message: `خطا در ارسال سفارش #${orderId} به ربات`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } else if (status === 'ready' && (!mqttService || !mqttService.isConnected)) {
            console.warn(`⚠️ Order ${orderId} ready but MQTT not connected - robot will not receive order`);
            
            if (io) {
                io.emit('mqtt_warning', {
                    message: `سفارش #${orderId} آماده است اما ربات متصل نیست`,
                    orderId: orderId,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // ارسال اعلان تغییر وضعیت از طریق WebSocket
        if (io) {
            io.emit('order_status_updated', {
                orderId: parseInt(orderId),
                oldStatus,
                newStatus: status,
                order: updatedOrder
            });
            console.log(`📡 Order status update sent via WebSocket`);
        }
        
        res.json({
            success: true,
            message: 'Order status updated',
            orderId: orderId,
            oldStatus: oldStatus,
            newStatus: status,
            robotNotified: status === 'ready' && mqttService && mqttService.isConnected
        });
        
    } catch (error) {
        console.error('❌ Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message
        });
    }
});

// Delete order (soft delete by setting status to cancelled)
router.delete('/:orderId', async (req, res) => {
    console.log(`🗑️ DELETE /${req.params.orderId} - Cancelling order`);
    
    try {
        const { orderId } = req.params;
        
        // Check if order exists
        const existingOrder = await db.getOrderById(orderId);
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        await db.updateOrderStatus(orderId, 'cancelled');
        
        // ارسال تغییر وضعیت به MQTT
        if (mqttService && mqttService.isConnected) {
            try {
                await mqttService.publishOrderStatusUpdate(orderId, existingOrder.status, 'cancelled');
                console.log('📡 Order cancellation published to MQTT');
            } catch (error) {
                console.error('❌ Failed to publish cancellation to MQTT:', error);
            }
        }
        
        // ارسال اعلان لغو سفارش
        if (io) {
            io.emit('order_status_updated', {
                orderId: parseInt(orderId),
                oldStatus: existingOrder.status,
                newStatus: 'cancelled'
            });
        }
        
        console.log(`✅ Cancelled order ${orderId}`);
        
        res.json({
            success: true,
            message: 'Order cancelled successfully',
            orderId: orderId
        });
        
    } catch (error) {
        console.error('❌ Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: error.message
        });
    }
});

// Handle automatic order status update from robot
router.post('/auto-update-status', async (req, res) => {
    console.log('🤖 POST /auto-update-status - Auto status update from robot');
    
    try {
        const { orderId, status, source } = req.body;
        
        if (!orderId || !status) {
            return res.status(400).json({
                success: false,
                message: 'Order ID and status are required'
            });
        }
        
        // Check if order exists
        const existingOrder = await db.getOrderById(orderId);
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Only allow certain automatic updates
        const allowedAutoStatuses = ['delivered'];
        if (!allowedAutoStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'This status cannot be auto-updated'
            });
        }
        
        const oldStatus = existingOrder.status;
        await db.updateOrderStatus(orderId, status);
        
        console.log(`🤖 Auto-updated order ${orderId} status from '${oldStatus}' to '${status}' (source: ${source || 'robot'})`);
        
        // Send notification via WebSocket
        if (io) {
            io.emit('order_status_updated', {
                orderId: parseInt(orderId),
                oldStatus,
                newStatus: status,
                source: source || 'robot',
                automated: true
            });
        }
        
        res.json({
            success: true,
            message: 'Order status auto-updated',
            orderId: orderId,
            oldStatus: oldStatus,
            newStatus: status,
            source: source || 'robot'
        });
        
    } catch (error) {
        console.error('❌ Error in auto status update:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to auto-update order status',
            error: error.message
        });
    }
});

console.log('📋 Order routes registered:');
console.log('   - GET    /test              - Test endpoint');
console.log('   - POST   /submit            - Submit new order');
console.log('   - GET    /all               - Get all orders');
console.log('   - GET    /pending           - Get pending orders');
console.log('   - GET    /recent            - Get recent orders');
console.log('   - GET    /status/:status    - Get orders by status');
console.log('   - GET    /:orderId          - Get specific order');
console.log('   - PUT    /:orderId/status   - Update order status');
console.log('   - DELETE /:orderId          - Cancel order');
console.log('   - POST   /auto-update-status- Auto status update from robot');

// Export router و توابع تنظیم
module.exports = router;
module.exports.setSocketIO = setSocketIO;
module.exports.setMQTTService = setMQTTService;