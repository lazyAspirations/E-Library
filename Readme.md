![Status](https://img.shields.io/badge/Status-In%20Development-yellow)
whisper · spinning bookshelf 📚✨
A minimalist, high-aesthetic web application for managing and reading personal digital libraries. Featuring a dynamic carousel interface and seamless integration with SQL Server for persistent storage.

🌟 Key Features🎨 
Sophisticated UI/UXSpinning Carousel: A 3D-inspired bookshelf navigation system where books rotate into view.
Soft Aesthetic Reader: A professional-grade reading panel with a custom-styled "mat" frame to blend the browser's PDF viewer into the application's design.
Glassmorphism: Modern UI elements using backdrop-filter for a premium, translucent feel.

⚙️ Functional Power
SQL Server Persistence: Full CRUD operations using Node.js and MS SQL Server to ensure your library survives page refreshes.

Binary Data Management: Stores actual PDF/EPUB files as VARBINARY(MAX) directly in the database for centralized management.

Auto-Thumbnailing: Uses PDF.js to automatically extract the first page of uploaded PDFs to use as the book cover.

Library Search: Real-time filtering to find specific titles instantly in large collections.

File Support: Native support for PDF viewing and EPUB downloads.

🛠️ Tech Stack

Frontend: HTML5, CSS3 (Custom Animations & Flexbox), Vanilla JavaScript.

Backend: Node.js, Express.js.Database: Microsoft SQL Server (MSSQL).

Libraries: - PDF.js for thumbnail generation and rendering.uuid for unique file identification.mssql for database connectivity.

🚀 Getting Started1. PrerequisitesNode.js installed.Microsoft SQL Server instance running.A database named BookShelf.2. Database SetupThe server is designed to auto-initialize your table. Ensure your SQL credentials in server.js match your local environment:JavaScriptconst sqlConfig = {
    user: 'sa',
    password: 'YOUR_PASSWORD',
    server: 'localhost',
    database: 'BookShelf',
    // ...
};
1. InstallationClone the repository: git clone https://github.com/lazyAspirations/Book-Reader.git
2. Install dependencies:npm install express cors mssql uuid multer
3. Start the server:node server.js
Open your browser to http://localhost:3000.
