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

<img width="1536" height="1024" alt="Image" src="https://github.com/user-attachments/assets/7f32fda9-4a2a-426c-af74-fdbf7eb6b7a1" />

```


RestaurantRobotProject/
├─ build/        # Flutter Web app for customers
├─ public                     # Node.js + SQL backend + Socket.IO
├─ orders_dashboard.html/                   # Management dashboard (HTML/CSS/JS)
├─ docs/                      # Project documentation and diagrams
├─ README.md                  # This file
└─ .gitignore

````

---

## ⚙️ Installation & Setup  

### 🖥️ Run the Server  
```bash
npm install
node index.js
````

### 🌐 Run the Management Website

Open files in `website/` in a browser or host them using a simple web server (e.g. Live Server).

### 📱 Run Flutter Web Client

```bash
cd build
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
<img width="2495" height="1596" alt="Image" src="https://github.com/user-attachments/assets/86521d5d-2593-469b-94af-f678ac92fe1f" />
<img width="1887" height="1395" alt="Image" src="https://github.com/user-attachments/assets/5fcd69a1-d998-4aa3-acb9-5815b356325e" />
<img width="1240" height="1401" alt="Image" src="https://github.com/user-attachments/assets/bb618611-9ad5-418b-8eb5-64a2eb0f0e29" />
<img width="1254" height="1397" alt="Image" src="https://github.com/user-attachments/assets/5af8b17e-8a7f-4ad4-a812-993caf96f568" />
<img width="1247" height="1405" alt="Image" src="https://github.com/user-attachments/assets/c4abfa46-13a9-4bee-8dd7-890f21a8a26e" />
<img width="1225" height="1420" alt="Image" src="https://github.com/user-attachments/assets/8bf1c61b-c299-44ff-b0ea-740548c20f3d" />
<img width="1245" height="1593" alt="Image" src="https://github.com/user-attachments/assets/96e5d2a3-8085-4a84-bad1-cd0cff3fc3b2" />
<img width="2475" height="1435" alt="Image" src="https://github.com/user-attachments/assets/577173d0-d45b-4082-967a-4a373635c271" />
<img width="2493" height="1440" alt="Image" src="https://github.com/user-attachments/assets/0e771388-219a-46a1-971c-2edf90f86f11" />
<img width="2486" height="1432" alt="Image" src="https://github.com/user-attachments/assets/55e70a00-0627-4525-b3d2-67c56f9f95cc" />
<img width="2491" height="1422" alt="Image" src="https://github.com/user-attachments/assets/3d65d468-294c-423a-8d86-17f2d869e182" />
<img width="2487" height="1438" alt="Image" src="https://github.com/user-attachments/assets/89e90b33-91d4-4c11-bb67-01cf166c4f54" />
<img width="2489" height="1439" alt="Image" src="https://github.com/user-attachments/assets/170a29b1-1f3d-4c4d-afac-ad6bdbd59388" />



---

## 📜 License

This project is open-source and available under the **MIT License**.


