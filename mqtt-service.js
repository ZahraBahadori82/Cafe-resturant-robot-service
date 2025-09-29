const mqtt = require('mqtt');
const EventEmitter = require('events');

class MQTTService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.client = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // MQTT Configuration with authentication
        this.config = {
            brokerUrl: options.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
            username: options.username || process.env.MQTT_USERNAME || 'cafe_user',
            password: options.password || process.env.MQTT_PASSWORD || 'cafe_password_2024',
            clientId: options.clientId || `cafe_server_${Math.random().toString(16).substr(2, 8)}`,
            keepalive: options.keepalive || 60,
            reconnectPeriod: options.reconnectPeriod || 2000,
            clean: options.clean !== undefined ? options.clean : true
        };

        // MQTT Topics - Updated for ROS compatibility
        this.topics = {
            // Robot Topics (ROS Compatible)
            ROBOT_ORDERS: '/cafe/robot/orders/next',
            ROBOT_STATUS: '/cafe/robot/status',
            ROBOT_LOCATION: '/cafe/robot/location',
            ROBOT_COMMANDS: '/cafe/robot/commands',
            ROBOT_FEEDBACK: '/cafe/robot/feedback',
            
            // Kitchen Topics
            KITCHEN_READY: '/cafe/kitchen/ready',
            KITCHEN_STATUS: '/cafe/kitchen/status',
            
            // Delivery Topics
            DELIVERY_START: '/cafe/delivery/start',
            DELIVERY_COMPLETE: '/cafe/delivery/complete',
            DELIVERY_STATUS: '/cafe/delivery/status',
            
            // System Topics
            SYSTEM_STATUS: '/cafe/system/status',
            EMERGENCY: '/cafe/emergency',
            
            // Order Management Topics
            ORDERS_ALL: '/cafe/orders/all',
            ORDERS_NEW: '/cafe/orders/new',
            ORDERS_STATUS_UPDATE: '/cafe/orders/status',
            ORDERS_PENDING: '/cafe/orders/pending',
            
            // ROS Integration Topics
            ROS_CMD_VEL: '/cmd_vel',
            ROS_ODOM: '/odom',
            ROS_MAP: '/map',
            ROS_GOAL: '/move_base_simple/goal',
            ROS_RESULT: '/move_base/result'
        };

        // Message handlers for different topic patterns
        this.topicHandlers = new Map();
        this.setupTopicHandlers();
        
        this.init();
    }

    init() {
        try {
            const options = {
                clientId: this.config.clientId,
                keepalive: this.config.keepalive,
                reconnectPeriod: this.config.reconnectPeriod,
                clean: this.config.clean,
                username: this.config.username,
                password: this.config.password,
                // Additional security options
                rejectUnauthorized: false, // Set to true in production with proper certificates
                connectTimeout: 30 * 1000, // 30 seconds
                will: {
                    topic: this.topics.SYSTEM_STATUS,
                    payload: JSON.stringify({
                        status: 'offline',
                        timestamp: new Date().toISOString(),
                        reason: 'unexpected_disconnect'
                    }),
                    qos: 1,
                    retain: true
                }
            };

            console.log('🔄 Connecting to MQTT broker at', this.config.brokerUrl);
            console.log('👤 Using username:', this.config.username);
            
            this.client = mqtt.connect(this.config.brokerUrl, options);
            this.setupEventHandlers();
            
        } catch (error) {
            console.error('❌ MQTT init error:', error);
            this.handleReconnection();
        }
    }

    setupEventHandlers() {
        this.client.on('connect', () => {
            console.log('✅ Connected to MQTT broker with authentication');
            this.isConnected = true;
            this.reconnectAttempts = 0;

            this.subscribeToTopics();
            this.publishSystemStatus('online');

            this.emit('connected');
        });

        this.client.on('message', (topic, message) => {
            try {
                // Parse message - handle both JSON and plain text
                let data;
                const messageStr = message.toString();
                
                try {
                    data = JSON.parse(messageStr);
                } catch {
                    // If not JSON, treat as plain text
                    data = { message: messageStr, raw: true };
                }

                console.log(`📨 Message on ${topic}:`, data);
                
                // Add topic to data for ROS compatibility
                const enrichedData = {
                    ...data,
                    topic: topic,
                    timestamp: new Date().toISOString(),
                    received_at: Date.now()
                };
                
                this.handleIncomingMessage(topic, enrichedData);
                
                // Emit generic message event with topic for external handlers
                this.emit('message', topic, enrichedData);
                
            } catch (error) {
                console.error('❌ Error processing message:', error);
                this.emit('messageError', topic, error, message.toString());
            }
        });

        this.client.on('error', (error) => {
            console.error('❌ MQTT Error:', error.message);
            this.isConnected = false;
            
            // Check if it's an authentication error
            if (error.message.includes('Not authorized') || error.message.includes('Connection refused')) {
                console.error('🔐 MQTT Authentication failed - check username/password');
                this.emit('authenticationFailed', error);
            }
            
            this.handleReconnection();
        });

        this.client.on('close', () => {
            console.log('🔌 MQTT connection closed');
            this.isConnected = false;
            this.handleReconnection();
        });

        this.client.on('offline', () => {
            console.warn('📴 MQTT client offline');
            this.isConnected = false;
        });

        this.client.on('reconnect', () => {
            console.log('🔄 MQTT reconnecting...');
        });
    }

    setupTopicHandlers() {
        // Define handlers for different topic patterns
        this.topicHandlers.set(this.topics.ROBOT_STATUS, (data) => {
            this.emit('robotStatus', data);
        });
        
        this.topicHandlers.set(this.topics.ROBOT_LOCATION, (data) => {
            this.emit('robotLocation', data);
        });
        
        this.topicHandlers.set(this.topics.ROBOT_FEEDBACK, (data) => {
            this.emit('robotFeedback', data);
        });
        
        this.topicHandlers.set(this.topics.DELIVERY_COMPLETE, (data) => {
            this.emit('deliveryComplete', data);
        });
        
        this.topicHandlers.set(this.topics.DELIVERY_STATUS, (data) => {
            this.emit('deliveryStatus', data);
        });
        
        this.topicHandlers.set(this.topics.EMERGENCY, (data) => {
            this.emit('emergency', data);
        });
        
        // ROS topic handlers
        this.topicHandlers.set(this.topics.ROS_ODOM, (data) => {
            this.emit('rosOdometry', data);
        });
        
        this.topicHandlers.set(this.topics.ROS_RESULT, (data) => {
            this.emit('rosNavigationResult', data);
        });
    }

    subscribeToTopics() {
        const topicsToSubscribe = [
            // Core system topics
            this.topics.ROBOT_STATUS,
            this.topics.ROBOT_LOCATION,
            this.topics.ROBOT_FEEDBACK,
            this.topics.DELIVERY_COMPLETE,
            this.topics.DELIVERY_STATUS,
            this.topics.KITCHEN_STATUS,
            this.topics.EMERGENCY,
            
            // ROS integration topics
            this.topics.ROS_ODOM,
            this.topics.ROS_RESULT,
            
            // Wildcard subscriptions for dynamic topics
            '/cafe/robot/+',
            '/cafe/orders/+',
            '/cafe/system/+'
        ];

        topicsToSubscribe.forEach(topic => {
            this.client.subscribe(topic, { qos: 1 }, (err) => {
                if (err) {
                    console.error(`❌ Subscribe error on ${topic}:`, err.message);
                } else {
                    console.log(`✅ Subscribed to ${topic}`);
                }
            });
        });
    }

    handleIncomingMessage(topic, data) {
        // Use specific handler if available
        const handler = this.topicHandlers.get(topic);
        if (handler) {
            handler(data);
            return;
        }

        // Handle wildcard patterns
        if (topic.startsWith('/cafe/robot/')) {
            this.emit('robotMessage', topic, data);
        } else if (topic.startsWith('/cafe/orders/')) {
            this.emit('orderMessage', topic, data);
        } else if (topic.startsWith('/cafe/system/')) {
            this.emit('systemMessage', topic, data);
        } else {
            console.log(`🔍 Unhandled topic: ${topic}`);
            this.emit('unhandledMessage', topic, data);
        }
    }

    // Enhanced publishing method with better error handling
    async publish(topic, data, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                const error = new Error('MQTT not connected');
                console.error('❌ Publish failed - not connected to broker');
                return reject(error);
            }

            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            const publishOptions = {
                qos: options.qos || 1,
                retain: options.retain || false,
                dup: options.dup || false
            };

            this.client.publish(topic, payload, publishOptions, (error) => {
                if (error) {
                    console.error(`❌ Failed to publish to ${topic}:`, error.message);
                    reject(error);
                } else {
                    console.log(`📤 Published to ${topic}:`, typeof data === 'string' ? data : JSON.stringify(data).substring(0, 100) + '...');
                    resolve(true);
                }
            });
        });
    }

    // NEW METHOD: Publish all orders from database
    async publishAllOrders(orders) {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const ordersData = {
            total_orders: orders.length,
            timestamp: new Date().toISOString(),
            server_id: this.config.clientId,
            orders: orders.map(order => ({
                id: order.id,
                table_id: order.table_id,
                status: order.status,
                total_price: order.total_price,
                items: typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items,
                created_at: order.created_at,
                updated_at: order.updated_at
            }))
        };

        return this.publish(this.topics.ORDERS_ALL, ordersData, { retain: true });
    }

    // NEW METHOD: Publish a new order
    async publishNewOrder(orderData) {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const newOrderData = {
            id: orderData.id,
            table_id: orderData.table_id,
            status: orderData.status,
            total_price: orderData.total_price,
            items: typeof orderData.items === 'string' ? JSON.parse(orderData.items || '[]') : orderData.items,
            created_at: orderData.created_at,
            timestamp: new Date().toISOString(),
            action: 'new_order_created',
            topic: this.topics.ORDERS_NEW
        };

        // Publish to both new orders and emit event
        await this.publish(this.topics.ORDERS_NEW, newOrderData);
        this.emit('newOrder', newOrderData);
        
        return newOrderData;
    }

    // NEW METHOD: Publish order status update
    async publishOrderStatusUpdate(orderId, oldStatus, newStatus) {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const statusUpdate = {
            order_id: orderId,
            old_status: oldStatus,
            new_status: newStatus,
            timestamp: new Date().toISOString(),
            action: 'status_updated',
            topic: this.topics.ORDERS_STATUS_UPDATE
        };

        return this.publish(this.topics.ORDERS_STATUS_UPDATE, statusUpdate);
    }

    // NEW METHOD: Publish pending orders
    async publishPendingOrders(pendingOrders) {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const pendingData = {
            pending_count: pendingOrders.length,
            timestamp: new Date().toISOString(),
            server_id: this.config.clientId,
            topic: this.topics.ORDERS_PENDING,
            orders: pendingOrders.map(order => ({
                id: order.id,
                table_id: order.table_id,
                status: order.status,
                total_price: order.total_price,
                items: typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items,
                created_at: order.created_at
            }))
        };

        return this.publish(this.topics.ORDERS_PENDING, pendingData, { retain: true });
    }

    // Enhanced robot communication methods
    async sendOrderToRobot(orderData) {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const robotOrder = {
            orderId: orderData.id,
            tableNumber: orderData.table_id,
            tableLocation: orderData.table_location,
            items: typeof orderData.items === 'string' ? JSON.parse(orderData.items || '[]') : orderData.items,
            totalPrice: orderData.total_price,
            priority: orderData.priority || 'normal',
            timestamp: new Date().toISOString(),
            action: 'deliver_to_table',
            topic: this.topics.ROBOT_ORDERS,
            deliveryInstructions: `Deliver order #${orderData.id} to table ${orderData.table_id}`
        };

        return this.publish(this.topics.ROBOT_ORDERS, robotOrder);
    }

    async sendRobotToLocation(tableNumber, action = 'go_to_table') {
        if (!this.isConnected) throw new Error('MQTT not connected');

        const command = {
            action,
            target_table: tableNumber,
            timestamp: new Date().toISOString(),
            topic: this.topics.ROBOT_COMMANDS
        };

        return this.publish(this.topics.ROBOT_COMMANDS, command);
    }

    // ROS-specific methods
    async publishROSGoal(x, y, theta = 0) {
        const goal = {
            header: {
                stamp: new Date().toISOString(),
                frame_id: 'map'
            },
            pose: {
                position: { x, y, z: 0 },
                orientation: { x: 0, y: 0, z: Math.sin(theta/2), w: Math.cos(theta/2) }
            },
            topic: this.topics.ROS_GOAL
        };

        return this.publish(this.topics.ROS_GOAL, goal);
    }

    async publishSystemStatus(status) {
        const systemData = {
            status,
            timestamp: new Date().toISOString(),
            server: 'cafe_backend',
            client_id: this.config.clientId,
            uptime: process.uptime(),
            topic: this.topics.SYSTEM_STATUS
        };

        return this.publish(this.topics.SYSTEM_STATUS, systemData, { retain: true });
    }

    async emergencyStop() {
        const emergencyData = {
            action: 'emergency_stop',
            timestamp: new Date().toISOString(),
            reason: 'Manual emergency stop triggered',
            topic: this.topics.EMERGENCY
        };

        return this.publish(this.topics.EMERGENCY, emergencyData, { qos: 2 }); // Ensure delivery
    }

    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(5000 * this.reconnectAttempts, 30000); // Max 30 seconds
            
            console.log(`🔁 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay/1000}s`);

            setTimeout(() => {
                if (!this.isConnected) {
                    this.init();
                }
            }, delay);
        } else {
            console.error('❌ Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            brokerUrl: this.config.brokerUrl,
            clientId: this.config.clientId,
            username: this.config.username,
            topics: this.topics
        };
    }

    // Get connection statistics
    getStats() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            uptime: this.isConnected ? Date.now() - (this.connectedAt || Date.now()) : 0,
            subscribedTopics: Object.keys(this.topics).length
        };
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            await this.publishSystemStatus('offline');
            this.client.end(false, {}, () => {
                console.log('🔌 Gracefully disconnected from MQTT broker');
            });
        }
    }
}

module.exports = MQTTService;