const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// SQL Server configuration
const sqlConfig = {
    user: 'sa',
    password: '',
    server: '', // Or '127.0.0.1'
    port: ,
    database: '',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Create uploads directory for thumbnails
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');

// Ensure thumbnails directory exists
async function ensureDirectories() {
    try {
        await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creating directories:', err);
    }
}

ensureDirectories();

// Configure multer for temporary file uploads (optional, since we're storing in DB)
const storage = multer.memoryStorage(); // Store in memory, then save to DB
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf' || ext === '.epub') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and EPUB files are allowed'));
        }
    }
});

// Connect to SQL Server
let pool;

async function connectToDatabase() {
    try {
        pool = await sql.connect(sqlConfig);
        console.log('✅ Connected to SQL Server');
        
        // Ensure table exists (already created, but just in case)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Books')
            CREATE TABLE Books (
                id INT PRIMARY KEY IDENTITY(1,1),
                fileName NVARCHAR(255) NOT NULL,
                fileData VARBINARY(MAX) NOT NULL,
                thumbnailImage NVARCHAR(MAX),
                uploadedAt DATETIME DEFAULT GETDATE()
            )
        `);
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }
}

connectToDatabase();

// Helper: Save thumbnail
async function saveThumbnail(thumbnailData, bookId) {
    if (!thumbnailData) return null;
    
    try {
        // Remove data URL prefix if present
        const base64Data = thumbnailData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        const thumbnailPath = path.join(THUMBNAILS_DIR, `${bookId}.jpg`);
        await fs.writeFile(thumbnailPath, buffer);
        
        return `/thumbnails/${bookId}.jpg`;
    } catch (err) {
        console.error('Error saving thumbnail:', err);
        return null;
    }
}

// Serve static files (thumbnails only)
app.use('/thumbnails', express.static(THUMBNAILS_DIR));

// Serve the frontend HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes

// GET all books (without file data for performance)
app.get('/api/books', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                id, 
                fileName, 
                thumbnailImage, 
                uploadedAt 
            FROM Books 
            ORDER BY uploadedAt DESC
        `);
        
        // Format the response to match frontend expectations
        const books = result.recordset.map(book => ({
            id: book.id,
            fileName: book.fileName,
            thumbnailImage: book.thumbnailImage,
            uploadDate: book.uploadedAt,
            // Add type based on file extension
            type: book.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/epub+zip'
        }));
        
        res.json(books);
    } catch (err) {
        console.error('Error fetching books:', err);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// GET single book (including file data for download)
app.get('/api/books/:id', async (req, res) => {
    try {
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Books WHERE id = @id');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        const book = result.recordset[0];
        
        // Don't send fileData in JSON response - use download endpoint instead
        res.json({
            id: book.id,
            fileName: book.fileName,
            thumbnailImage: book.thumbnailImage,
            uploadedAt: book.uploadedAt
        });
    } catch (err) {
        console.error('Error fetching book:', err);
        res.status(500).json({ error: 'Failed to fetch book' });
    }
});

// GET book file for download/view
app.get('/api/books/:id/file', async (req, res) => {
    try {
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT fileName, fileData FROM Books WHERE id = @id');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        const book = result.recordset[0];
        const fileData = book.fileData; // This is a Buffer
        
        // Set appropriate content type
        const ext = path.extname(book.fileName).toLowerCase();
        const contentType = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${book.fileName}"`);
        res.send(fileData);
        
    } catch (err) {
        console.error('Error fetching book file:', err);
        res.status(500).json({ error: 'Failed to fetch book file' });
    }
});

// POST add book (JSON with base64)
app.post('/api/books', async (req, res) => {
    try {
        const { fileName, fileData, thumbnailImage } = req.body;
        
        console.log('--- New Upload Attempt ---');
        console.log('File Name:', fileName);
        console.log('Data Length:', fileData ? fileData.length : 'NULL');

        if (!fileName || !fileData) {
            console.log('❌ Error: Missing data in request body');
            return res.status(400).json({ error: 'Missing fileName or fileData' });
        }

        const uniqueId = uuidv4();
        let thumbnailUrl = null;
        if (thumbnailImage) {
            thumbnailUrl = await saveThumbnail(thumbnailImage, uniqueId);
            console.log('📸 Thumbnail saved at:', thumbnailUrl);
        }

        const fileBuffer = Buffer.from(fileData, 'base64');
        console.log('💾 Buffer created, sending to SQL...');

        const result = await pool.request()
            .input('fileName', sql.NVarChar, fileName)
            .input('fileData', sql.VarBinary, fileBuffer)
            .input('thumbnailImage', sql.NVarChar, thumbnailUrl)
            .query(`
                INSERT INTO Books (fileName, fileData, thumbnailImage, uploadedAt)
                OUTPUT INSERTED.id, INSERTED.fileName, INSERTED.thumbnailImage, INSERTED.uploadedAt
                VALUES (@fileName, @fileData, @thumbnailImage, GETDATE())
            `);

        console.log('✅ SQL Insert Success. New ID:', result.recordset[0].id);
        res.status(201).json(result.recordset[0]);

    } catch (err) {
        console.error('❌ POST /api/books Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST upload book (multipart/form-data)
app.post('/api/books/upload', upload.single('book'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileName = req.file.originalname;
        const fileBuffer = req.file.buffer;
        const uniqueId = uuidv4();
        
        // Handle thumbnail if provided in request body
        let thumbnailUrl = null;
        if (req.body.thumbnailImage) {
            thumbnailUrl = await saveThumbnail(req.body.thumbnailImage, uniqueId);
        }

        // Insert into database
        const result = await pool.request()
            .input('fileName', sql.NVarChar, fileName)
            .input('fileData', sql.VarBinary, fileBuffer)
            .input('thumbnailImage', sql.NVarChar, thumbnailUrl)
            .query(`
                INSERT INTO Books (fileName, fileData, thumbnailImage, uploadedAt)
                OUTPUT INSERTED.id, INSERTED.fileName, INSERTED.thumbnailImage, INSERTED.uploadedAt
                VALUES (@fileName, @fileData, @thumbnailImage, GETDATE())
            `);

        const newBook = result.recordset[0];
        
        const responseBook = {
            id: newBook.id,
            fileName: newBook.fileName,
            thumbnailImage: newBook.thumbnailImage,
            uploadDate: newBook.uploadedAt,
            type: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/epub+zip'
        };

        console.log('✅ Book uploaded to database:', fileName);
        res.status(201).json(responseBook);

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Failed to upload book' });
    }
});

// DELETE all books
app.delete('/api/books', async (req, res) => {
    try {
        // Get all books to delete thumbnails
        const books = await pool.request().query('SELECT thumbnailImage FROM Books');
        
        // Delete thumbnail files
        for (const book of books.recordset) {
            if (book.thumbnailImage) {
                const thumbnailPath = path.join(__dirname, book.thumbnailImage);
                try {
                    await fs.unlink(thumbnailPath);
                } catch (err) {
                    console.error(`Error deleting thumbnail ${thumbnailPath}:`, err);
                }
            }
        }
        
        // Delete all records from database
        await pool.request().query('DELETE FROM Books');
        
        console.log('✅ All books deleted from database');
        res.json({ message: 'All books deleted successfully' });
        
    } catch (err) {
        console.error('Error deleting books:', err);
        res.status(500).json({ error: 'Failed to delete books' });
    }
});

// DELETE single book
app.delete('/api/books/:id', async (req, res) => {
    try {
        // Get book to delete thumbnail
        const bookResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT thumbnailImage FROM Books WHERE id = @id');
        
        if (bookResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const book = bookResult.recordset[0];
        
        // Delete thumbnail file
        if (book.thumbnailImage) {
            const thumbnailPath = path.join(__dirname, book.thumbnailImage);
            try {
                await fs.unlink(thumbnailPath);
            } catch (err) {
                console.error(`Error deleting thumbnail ${thumbnailPath}:`, err);
            }
        }
        
        // Delete from database
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Books WHERE id = @id');
        
        console.log(`✅ Book ${req.params.id} deleted from database`);
        res.json({ message: 'Book deleted successfully' });
        
    } catch (err) {
        console.error('Error deleting book:', err);
        res.status(500).json({ error: 'Failed to delete book' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`📚 Bookshelf server running at http://localhost:${PORT}`);
    console.log(`🖼️  Thumbnails directory: ${THUMBNAILS_DIR}`);
    console.log(`🗄️  Using SQL Server database: BookShelf`);
    console.log(`🌐 Frontend available at: http://localhost:${PORT}`);
});