# 🛎️ Cafe Restaurant Service Robot System

## 📌 Overview  
This project is a **complete restaurant ordering and delivery management system** that connects customers, managers, kitchen staff, cashier, waiter, and the service robot together.  
Its main goal is to **reduce human workload**, **increase service speed**, and **deliver a modern and seamless experience** to restaurant customers.  

---

## 🏗️ System Architecture  
The system consists of three main components:  

### 1️⃣ **Customer Side (Flutter Web App)**  
- Customers enter the system by **scanning a QR code** placed on the table.  
- They can browse the menu, select items, and place an order.  
- Orders are sent directly to the **Node.js server** and stored in the **SQL database**.  
- The Flutter Web app is precompiled and hosted on the server for faster load times.  

### 2️⃣ **Server (Node.js + SQL + WebSocket)**  
- Handles order registration and stores them in SQL database with **timestamp and total price**.  
- Pushes real-time order updates using **Socket.IO (WebSocket)** to all connected dashboards.  
- Sends order data to the management website.  
- Publishes and listens to **MQTT Topics** for robot communication:  
  - `orders/new` → Sends new orders to the kitchen  
  - `orders/ready` → Notifies waiter/cashier when an order is ready  
  - `orders/delivered` → Updates status when the robot delivers the order  

### 3️⃣ **Management Website (HTML/CSS/JS)**  
This dashboard has multiple roles with separated login access:  
- **Admin:** Full access to all sections and reports  
- **Kitchen:** Only sees and manages pending orders  
- **Cashier:** Handles payments and invoice approval  
- **Robot:** Displays delivery status and communicates with MQTT  

---

## 📂 Project Structure  

```

RestaurantRobotProject/
├─ flutter_web_client/        # Flutter Web app for customers
├─ server/                    # Node.js + SQL backend + Socket.IO
├─ website/                   # Management dashboard (HTML/CSS/JS)
├─ docs/                      # Project documentation and diagrams
├─ README.md                  # This file
└─ .gitignore

````

---

## ⚙️ Installation & Setup  

### 🖥️ Run the Server  
```bash
cd server
npm install
node index.js
````

### 🌐 Run the Management Website

Open files in `website/` in a browser or host them using a simple web server (e.g. Live Server).

### 📱 Run Flutter Web Client

```bash
cd flutter_web_client
flutter run -d chrome
```

---

## 🛠️ Tech Stack

* **Frontend:** Flutter Web, HTML, CSS, JavaScript
* **Backend:** Node.js, Express.js
* **Database:** MySQL / SQL Server
* **Real-Time Communication:** **Socket.IO (WebSocket)**
* **Robot Communication:** MQTT Protocol

---

## 🧩 Features

✅ QR Code-based customer login
✅ Order storage with date and total price tracking
✅ Role-based access for admin, kitchen, cashier, and robot
✅ **Real-time order updates** using Socket.IO
✅ **Robot communication** using MQTT topics
✅ Modular and easily expandable architecture

---

## 🚀 Future Improvements

* Integration with physical robot hardware
* More advanced management dashboard UI
* Real-time analytics and data visualization
* change server node.js --> asp.net
---

## 📸 Screenshots & Diagrams

![System Architecture](docs/structure.png)
![System flutter](docs/flutter_first.png)
![System flutter](docs/flutter_second.png)
![System flutter](docs/flutter_3.png)
![System flutter](docs/flutter_4.png)
![System flutter](docs/flutter_5.png)
![System flutter](docs/flutter_6.png)
![System flutter](docs/flutter_7.png)
![System flutter](docs/flutter_and_web.png)
![System Web login](docs/login.png)
![System WEb admin](docs/admin_section.png)
![System web cashier](docs/cashier_section.png)
![System web kitchen](docs/kitchen_section.png)
![System web robot](docs/robot_section.png)

---

## 📜 License

This project is open-source and available under the **MIT License**.


