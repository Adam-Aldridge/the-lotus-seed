const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();
const PORT = 3000;

// Add middleware to parse JSON bodies (must be before route definitions)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure the upload directories exist
const imagesDir = path.join(__dirname, 'public', 'content-efs/images');
const pdfsDir = path.join(__dirname, 'public', 'content-efs/pdfs');
const dataDir = path.join(__dirname, 'public', 'data');
const viewsDir = path.join(__dirname, 'views');
const tenantsDir = path.join(__dirname, 'public', 'data', 'tenants');

// Create directories if they don't exist
[imagesDir, pdfsDir, dataDir, viewsDir, tenantsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

// Copy template files to views directory if they don't exist there
const templateFiles = ['index-template.html', 'post-template.html'];
templateFiles.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(viewsDir, file);
  
  if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} to views directory`);
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath;
    
    // Get tenant ID from the request
    const tenantId = req.params.tenantId || 'default';
    
    // Determine which folder to use based on file type
    if (file.fieldname === 'image') {
      uploadPath = path.join(imagesDir, tenantId);
    } else if (file.fieldname === 'pdf') {
      uploadPath = path.join(pdfsDir, tenantId);
    } else {
      uploadPath = path.join(__dirname, 'public', 'uploads', tenantId);
    }
    
    // Create tenant-specific directories if they don't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    console.log(`Saving ${file.fieldname} to: ${uploadPath}`);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename based on timestamp and original extension
    const timestamp = Date.now();
    
    if (file.fieldname === 'image') {
      // Get the file extension
      const ext = path.extname(file.originalname).toLowerCase() || '.jpeg';
      const filename = `image_${timestamp}${ext}`;
      console.log(`Image filename will be: ${filename}`);
      cb(null, filename);
    } else if (file.fieldname === 'pdf') {
      const filename = `pdf_${timestamp}.pdf`;
      console.log(`PDF filename will be: ${filename}`);
      cb(null, filename);
    } else {
      cb(null, file.originalname);
    }
  }
});

// File filter to check file types
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'image') {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Only image files are allowed!'), false);
  } else if (file.fieldname === 'pdf') {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    return cb(new Error('Only PDF files are allowed!'), false);
  }
  cb(null, true);
};

// Set up multer with different size limits for images and PDFs
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // We'll handle file size validation manually in the route
    fileSize: 300 * 1024 * 1024 // 300MB in bytes (for PDFs)
  }
});

// Middleware to verify password
const verifyPassword = (req, res, next) => {
  // Get password from request body or headers
  const password = req.body.password || req.headers['x-password'];
  const tenantId = req.params.tenantId;
  
  console.log(`Verifying password for tenant ${tenantId}:`, password);
  
  // Get the tenant-specific password or use default
  const tenantPassword = getTenantPassword(tenantId);
  
  // Check if password matches the tenant's password
  if (password !== tenantPassword) {
    console.log('Password verification failed');
    return res.status(403).json({
      success: false,
      message: 'Invalid password'
    });
  }
  
  console.log('Password verification successful');
  // Password is correct, proceed
  next();
};

// Helper function to get tenant password
function getTenantPassword(tenantId) {
  if (!tenantId) return 'thisMind'; // Default password
  
  try {
    const tenantConfigPath = path.join(tenantsDir, `${tenantId}-config.json`);
    if (fs.existsSync(tenantConfigPath)) {
      const tenantConfig = JSON.parse(fs.readFileSync(tenantConfigPath, 'utf8'));
      return tenantConfig.password || 'thisMind';
    }
  } catch (error) {
    console.error(`Error getting password for tenant ${tenantId}:`, error);
  }
  
  return 'thisMind'; // Default password if tenant config not found
}

// Helper function to render page based on template and data
function renderPage(res, pageType, pageTitle, tenantId = 'default') {
  try {
    // Default page content
    let aboutContent = '';
    let dataFile;
    
    // Determine which data file to use based on page type and tenant
    if (tenantId === 'default') {
      // Original behavior for root site
      if (pageType === 'secondary') {
        dataFile = 'secondary-posts.json';
      } else if (pageType === 'about') {
        dataFile = 'about-content.json';
      } else {
        dataFile = 'main-posts.json';
      }
      
      // Original data directory
      dataFile = path.join(__dirname, 'public', 'data', dataFile);
    } else {
      // Tenant-specific data
      const tenantDir = path.join(tenantsDir, tenantId);
      
      // Create tenant directory if it doesn't exist
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true });
      }
      
      if (pageType === 'secondary') {
        dataFile = path.join(tenantDir, 'secondary-posts.json');
      } else if (pageType === 'about') {
        dataFile = path.join(tenantDir, 'about-content.json');
      } else {
        dataFile = path.join(tenantDir, 'main-posts.json');
      }
    }
    
    // Create data files if they don't exist
    if (!fs.existsSync(dataFile)) {
      const defaultData = { 
        posts: [],
        about: '',
        content: ''
      };
      
      // Make sure the directory exists
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
      console.log(`Created default data file: ${dataFile}`);
    }
    
    // Read the data file
    const blogData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    
    /// This 
    // Get about content if it exists
    if (pageType === 'about' && blogData.content) {
      //aboutContent = `<div>  </div>`;
      //aboutContent = `<div> <head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>My First HTML Page</title>\n    <style>\n        body {\n            font-family: Arial, sans-serif;\n            line-height: 1.6;\n      \n            margin: 0 auto;\n            padding: 20px;\n            background-color: #f5f5f5;\n            color: #333;\n        }\n        \n        header {\n            background-color: #4a6ea9;\n            color: white;\n            padding: 1rem;\n            text-align: center;\n            border-radius: 8px;\n            margin-bottom: 20px;\n        }\n        \n        h1 {\n            margin-top: 0;\n        }\n        \n        h2 {\n            color: #4a6ea9;\n            border-bottom: 2px solid #4a6ea9;\n            padding-bottom: 5px;\n        }\n        \n        .highlight {\n            background-color: #ffffcc;\n            padding: 10px;\n            border-left: 4px solid #ffcc00;\n            margin: 10px 0;\n        }\n        \n        .info-box {\n            border: 1px solid #ccc;\n            border-radius: 8px;\n            padding: 15px;\n            margin: 20px 0;\n            background-color: white;\n            box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n        }\n        \n        footer {\n            text-align: center;\n            margin-top: 30px;\n            padding-top: 10px;\n            border-top: 1px solid #ccc;\n            font-size: 0.8rem;\n            color: #666;\n        }\n    </style>\n</head>\n<body>\n    \n    \n    <main>\n        <h2>About This Page</h2>\n        <p>This is a basic HTML page with some styling applied through CSS. It demonstrates various HTML elements and how they can be styled.</p>\n        \n        <div class=\"highlight\">\n            <p>This is a highlighted section that stands out from the rest of the content.</p>\n        </div>\n        \n        <h2>Features Demonstrated</h2>\n        <ul>\n            <li>HTML document structure</li>\n            <li>Header and paragraph text</li>\n            <li>Styled headings (h1, h2)</li>\n            <li>Custom CSS classes</li>\n            <li>Color and spacing adjustments</li>\n        </ul>\n        \n        <div class=\"info-box\">\n            <h3>Did You Know?</h3>\n            <p>HTML (HyperText Markup Language) and CSS (Cascading Style Sheets) are two of the core technologies for building web pages. HTML provides the structure, while CSS handles the presentation and layout.</p>\n        </div>\n    </main>\n    \n    <footer>\n        &copy; 2025 My Website. All rights reserved.\n    </footer>\n</body></div>`;
      aboutContent = `<div class="page-about-content">${blogData.content}</div>`;
    } else if (blogData.about) {
      aboutContent = `<div class="page-about-content">${blogData.about}</div>`;
    }
    
    // Load templates
    const postTemplate = fs.readFileSync(path.join(__dirname, 'views', 'post-template.html'), 'utf8');
    const indexTemplate = fs.readFileSync(path.join(__dirname, 'views', 'index-template.html'), 'utf8');
    
    // For about page, we'll use special template
    let postsHTML = '';
    
    if (pageType === 'about') {
      // For the about page, we'll use the about content as the main content
      //postsHTML = `<div class="about-page-content">${blogData.content || 'About page content goes here.'}</div>`;
  
    } else {
      // Generate HTML for each blog post
      postsHTML = (blogData.posts || []).map(post => {
        // Make a copy of the template for each post
        let postHTML = postTemplate;
        
        // Replace all placeholders with actual post data
        postHTML = postHTML.replace(/\{\{id\}\}/g, post.id);
        postHTML = postHTML.replace(/\{\{title\}\}/g, post.title);
        
        // Add tenant path to image and PDF paths
        let imagePath = post.image;
        let pdfPath = post.pdf;
        
        // Adjust paths for tenant-specific files
        if (tenantId !== 'default') {
          // Keep original path if it's a default asset
          if (!imagePath.includes('default.jpeg')) {
            const imgParts = imagePath.split('/');
            imagePath = `${imgParts[0]}/${tenantId}/${imgParts[imgParts.length - 1]}`;
          }
          
          if (!pdfPath.includes('default.pdf')) {
            const pdfParts = pdfPath.split('/');
            pdfPath = `${pdfParts[0]}/${tenantId}/${pdfParts[pdfParts.length - 1]}`;
          }
        }
        
        postHTML = postHTML.replace(/\{\{image\}\}/g, imagePath);
        postHTML = postHTML.replace(/\{\{description\}\}/g, post.description);
        postHTML = postHTML.replace(/\{\{pdf\}\}/g, pdfPath);
        
        return postHTML;
      }).join('');
    }
    
    //////+
    // Replace the conditional display in the template with server-side logic
    let displayValue = pageType === 'about' ? 'none' : 'flex';
    //let displayValue = 'flex';

    // Create tenant-aware page title
    const siteTitle = tenantId !== 'default' ? `${tenantId} - ${pageTitle}` : pageTitle;
    
    // Insert the posts HTML and about content into the index template
    let html = indexTemplate.replace('{{posts}}', postsHTML);
    html = html.replace('{{about}}', aboutContent);
    html = html.replace(/\{\{pageType\}\}/g, pageType);
    html = html.replace(/\{\{pageTitle\}\}/g, siteTitle);
    
    //////+
    // Fix the conditional display syntax issue
    html = html.replace(/style="display: \{\{pageType === 'about' \? 'none' : 'flex'\}\}"/g, 
                       `style="display: ${displayValue}"`);
    
    // Add tenant ID to the rendered page for client-side usage
    html = html.replace('</head>', `<script>const TENANT_ID = "${tenantId}";</script></head>`);
    
    // Fix CSS and script paths to use absolute URLs
    // This ensures CSS and JS files load correctly in subpages
    html = html.replace('href="styles.css"', 'href="/styles.css"');
    html = html.replace('src="js/main.js"', 'src="/js/main.js"');
    
    // Modify navigation links to include tenant path if using a tenant
    if (tenantId !== 'default') {
      html = html.replace(/<a href="\/"/g, `<a href="/${tenantId}"`);
      html = html.replace(/<a href="\/secondary"/g, `<a href="/${tenantId}/secondary"`);
      html = html.replace(/<a href="\/about"/g, `<a href="/${tenantId}/about"`);
    }
    
    // Send the complete HTML
    res.send(html);
  } catch (error) {
    console.error('Error rendering page:', error);
    res.status(500).send('An error occurred while loading the page');
  }
}

// Serve admin page for tenant management
app.get('/admin', (req, res) => {
  const adminPagePath = path.join(__dirname, 'public', 'admin.html');
  
  // Check if admin page exists, create it if not
  if (!fs.existsSync(adminPagePath)) {
    const adminTemplatePath = path.join(__dirname, 'views', 'admin.html');
    if (fs.existsSync(adminTemplatePath)) {
      fs.copyFileSync(adminTemplatePath, adminPagePath);
    } else {
      // Create a simple admin page if template doesn't exist
      fs.writeFileSync(adminPagePath, `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Blog Admin</title>
          <meta http-equiv="refresh" content="0;url=/">
        </head>
        <body>
          <p>Redirecting to home page...</p>
        </body>
        </html>
      `);
    }
  }
  
  res.sendFile(adminPagePath);
});

// Routes for default site (existing functionality)
app.get('/', (req, res) => {
  renderPage(res, 'main', 'Main Blog');
});

app.get('/secondary', (req, res) => {
  renderPage(res, 'secondary', 'Secondary Blog');
});

app.get('/about', (req, res) => {
  renderPage(res, 'about', 'About Us');
});

// New routes for tenant-specific pages
app.get('/:tenantId', (req, res) => {
  const tenantId = req.params.tenantId;
  renderPage(res, 'main', 'Main Blog', tenantId);
});

app.get('/:tenantId/secondary', (req, res) => {
  const tenantId = req.params.tenantId;
  renderPage(res, 'secondary', 'Secondary Blog', tenantId);
});

app.get('/:tenantId/about', (req, res) => {
  const tenantId = req.params.tenantId;
  renderPage(res, 'about', 'About Us', tenantId);
});

// API endpoint to get blog posts as JSON for different page types
app.get('/api/posts/:pageType', (req, res) => {
  try {
    const pageType = req.params.pageType;
    let dataFile;
    
    // Determine which data file to use
    if (pageType === 'main') {
      dataFile = 'main-posts.json';
    } else if (pageType === 'secondary') {
      dataFile = 'secondary-posts.json';
    } else if (pageType === 'about') {
      dataFile = 'about-content.json';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    const filePath = path.join(__dirname, 'public', 'data', dataFile);
    
    // Create the file with default data if it doesn't exist
    if (!fs.existsSync(filePath)) {
      const defaultData = { 
        posts: [],
        about: '',
        content: ''
      };
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ success: false, message: 'Failed to get posts: ' + error.message });
  }
});

// Tenant-specific API to get blog posts
app.get('/api/:tenantId/posts/:pageType', (req, res) => {
  try {
    const pageType = req.params.pageType;
    const tenantId = req.params.tenantId;
    let dataFile;
    
    // Get tenant-specific data file
    const tenantDir = path.join(tenantsDir, tenantId);
    
    // Create tenant directory if it doesn't exist
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    
    // Determine which data file to use
    if (pageType === 'main') {
      dataFile = path.join(tenantDir, 'main-posts.json');
    } else if (pageType === 'secondary') {
      dataFile = path.join(tenantDir, 'secondary-posts.json');
    } else if (pageType === 'about') {
      dataFile = path.join(tenantDir, 'about-content.json');
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    // Create the file with default data if it doesn't exist
    if (!fs.existsSync(dataFile)) {
      const defaultData = { 
        posts: [],
        about: '',
        content: ''
      };
      fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
    }
    
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('Error getting tenant posts:', error);
    res.status(500).json({ success: false, message: 'Failed to get posts: ' + error.message });
  }
});

// API endpoint to update about content for any page type
app.post('/api/about/:pageType', (req, res) => {
  try {
    const { content, password } = req.body;
    const pageType = req.params.pageType;
    
    // Validate password
    if (password !== 'thisMind') {
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = 'main-posts.json';
    } else if (pageType === 'secondary') {
      dataFile = 'secondary-posts.json';
    } else if (pageType === 'about') {
      dataFile = 'about-content.json';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    const filePath = path.join(__dirname, 'public', 'data', dataFile);
    
    // Read the current data
    let data = {};
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      // Create default structure
      data = {
        posts: [],
        about: '',
        content: ''
      };
      // Create directory if it doesn't exist
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    
    // Update the about content
    if (pageType === 'about') {
      data.content = content;
    } else {
      data.about = content;
    }
    
    // Write back to the file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    res.json({ 
      success: true, 
      message: 'About content updated successfully'
    });
  } catch (error) {
    console.error('Error updating about content:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update about content: ' + error.message 
    });
  }
});

// Tenant-specific API for updating about content
app.post('/api/:tenantId/about/:pageType', (req, res) => {
  try {
    const { content, password } = req.body;
    const pageType = req.params.pageType;
    const tenantId = req.params.tenantId;
    
    // Get the tenant-specific password
    const tenantPassword = getTenantPassword(tenantId);
    
    // Validate password
    if (password !== tenantPassword) {
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Get tenant-specific data file
    const tenantDir = path.join(tenantsDir, tenantId);
    
    // Create tenant directory if it doesn't exist
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = path.join(tenantDir, 'main-posts.json');
    } else if (pageType === 'secondary') {
      dataFile = path.join(tenantDir, 'secondary-posts.json');
    } else if (pageType === 'about') {
      dataFile = path.join(tenantDir, 'about-content.json');
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    // Read the current data or create default
    let data = {};
    if (fs.existsSync(dataFile)) {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } else {
      // Create default structure
      data = {
        posts: [],
        about: '',
        content: ''
      };
    }
    
    // Update the about content
    if (pageType === 'about') {
      data.content = content;
    } else {
      data.about = content;
    }
    
    // Write back to the file
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    
    res.json({ 
      success: true, 
      message: 'About content updated successfully'
    });
  } catch (error) {
    console.error('Error updating tenant about content:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update about content: ' + error.message 
    });
  }
});

// API endpoint to add a new blog post with file uploads
app.post('/api/posts/:pageType', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), (req, res) => {
  try {
    const { title, description, password } = req.body;
    const pageType = req.params.pageType;
    
    // Basic validation
    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and description are required' 
      });
    }
    
    // Validate password
    if (password !== 'thisMind') {
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Manual file size validation for image
    if (req.files && req.files.image && req.files.image[0].size > 50 * 1024 * 1024) {
      // If image is larger than 50MB, delete it and return error
      fs.unlinkSync(req.files.image[0].path);
      return res.status(400).json({
        success: false,
        message: 'Image file is too large. Maximum size is 50MB.'
      });
    }
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = 'main-posts.json';
    } else if (pageType === 'secondary') {
      dataFile = 'secondary-posts.json';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    const filePath = path.join(__dirname, 'public', 'data', dataFile);
    
    // Create directory if it doesn't exist
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    
    // Read the current data or create a new data structure
    let blogData = { posts: [], about: '', content: '' };
    if (fs.existsSync(filePath)) {
      blogData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    // Ensure posts array exists
    if (!blogData.posts) {
      blogData.posts = [];
    }
    
    // Find the highest ID to assign a new unique ID
    const highestId = blogData.posts.reduce((max, post) => {
      return post.id > max ? post.id : max;
    }, 0);
    
    // Set default image and PDF paths
    let imagePath = 'content-efs/images/default.jpeg';
    let pdfPath = 'content-efs/pdfs/default.pdf';
    
    // Update paths if files were uploaded
    if (req.files) {
      if (req.files.image && req.files.image.length > 0) {
        // Get the relative path for the image
        const filename = path.basename(req.files.image[0].path);
        imagePath = `content-efs/images/${filename}`;
      }
      
      if (req.files.pdf && req.files.pdf.length > 0) {
        // Get the relative path for the PDF
        const filename = path.basename(req.files.pdf[0].path);
        pdfPath = `content-efs/pdfs/${filename}`;
      }
    }
    
    // Create a new post object
    const newPost = {
      id: highestId + 1,
      title,
      description,
      image: imagePath,
      pdf: pdfPath
    };
    
    // Add the new post to the array
    blogData.posts.unshift(newPost); // Add to the beginning
    
    // Write back to the file
    fs.writeFileSync(filePath, JSON.stringify(blogData, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Post added successfully',
      post: newPost
    });
  } catch (error) {
    console.error('Error adding post:', error);
    res.status(500).json({ success: false, message: 'Failed to add post: ' + error.message });
  }
});

// Tenant-specific API for adding new blog posts
app.post('/api/:tenantId/posts/:pageType', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), (req, res) => {
  try {
    const { title, description, password } = req.body;
    const pageType = req.params.pageType;
    const tenantId = req.params.tenantId;
    
    // Basic validation
    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and description are required' 
      });
    }
    
    // Get the tenant-specific password
    const tenantPassword = getTenantPassword(tenantId);
    
    // Validate password
    if (password !== tenantPassword) {
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Manual file size validation for image
    if (req.files && req.files.image && req.files.image[0].size > 50 * 1024 * 1024) {
      // If image is larger than 50MB, delete it and return error
      fs.unlinkSync(req.files.image[0].path);
      return res.status(400).json({
        success: false,
        message: 'Image file is too large. Maximum size is 50MB.'
      });
    }
    
    // Get tenant-specific data file
    const tenantDir = path.join(tenantsDir, tenantId);
    
    // Create tenant directory if it doesn't exist
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = path.join(tenantDir, 'main-posts.json');
    } else if (pageType === 'secondary') {
      dataFile = path.join(tenantDir, 'secondary-posts.json');
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    // Read the current data or create a new data structure
    let blogData = { posts: [], about: '', content: '' };
    if (fs.existsSync(dataFile)) {
      blogData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
    
    // Ensure posts array exists
    if (!blogData.posts) {
      blogData.posts = [];
    }
    
    // Find the highest ID to assign a new unique ID
    const highestId = blogData.posts.reduce((max, post) => {
      return post.id > max ? post.id : max;
    }, 0);
    
    // Set default image and PDF paths
    let imagePath = 'content-efs/images/default.jpeg';
    let pdfPath = 'content-efs/pdfs/default.pdf';
    
    // Update paths if files were uploaded
    if (req.files) {
      if (req.files.image && req.files.image.length > 0) {
        // Get the relative path for the image (with tenant subfolder)
        const filename = path.basename(req.files.image[0].path);
        imagePath = `content-efs/images/${tenantId}/${filename}`;
      }
      
      if (req.files.pdf && req.files.pdf.length > 0) {
        // Get the relative path for the PDF (with tenant subfolder)
        const filename = path.basename(req.files.pdf[0].path);
        pdfPath = `content-efs/pdfs/${tenantId}/${filename}`;
      }
    }
    
    // Create a new post object
    const newPost = {
      id: highestId + 1,
      title,
      description,
      image: imagePath,
      pdf: pdfPath
    };
    
    // Add the new post to the array
    blogData.posts.unshift(newPost); // Add to the beginning
    
    // Write back to the file
    fs.writeFileSync(dataFile, JSON.stringify(blogData, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Post added successfully',
      post: newPost
    });
  } catch (error) {
    console.error('Error adding tenant post:', error);
    res.status(500).json({ success: false, message: 'Failed to add post: ' + error.message });
  }
});

// API endpoint to delete a blog post
app.delete('/api/posts/:pageType/:id', (req, res) => {
  try {
    // Verify password from request headers
    const password = req.headers['x-password'];
    const pageType = req.params.pageType;
    
    console.log('Delete request with password:', password);
    
    // Check if password matches the hardcoded value
    if (password !== 'thisMind') {
      console.log('Delete password verification failed');
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = 'main-posts.json';
    } else if (pageType === 'secondary') {
      dataFile = 'secondary-posts.json';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    const postId = parseInt(req.params.id);
    const filePath = path.join(__dirname, 'public', 'data', dataFile);
    
    // Check if the data file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'No posts found for this page type' });
    }
    
    // Read the current data
    const blogData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Find the post to delete first (to get file paths)
    const postToDelete = blogData.posts.find(post => post.id === postId);
    
    // If we have a post and it has custom files, delete them
    if (postToDelete) {
      // Delete image file if it's not the default
      if (postToDelete.image && postToDelete.image !== 'content-efs/images/default.jpeg') {
        const imagePath = path.join(__dirname, 'public', postToDelete.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`Deleted image: ${imagePath}`);
        }
      }
      
      // Delete PDF file if it's not the default
      if (postToDelete.pdf && postToDelete.pdf !== 'content-efs/pdfs/default.pdf') {
        const pdfPath = path.join(__dirname, 'public', postToDelete.pdf);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`Deleted PDF: ${pdfPath}`);
        }
      }
    } else {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Filter out the post to be deleted
    const updatedPosts = blogData.posts.filter(post => post.id !== postId);
    
    // Update the data object
    blogData.posts = updatedPosts;
    
    // Write back to the file
    fs.writeFileSync(filePath, JSON.stringify(blogData, null, 2));
    
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ success: false, message: 'Failed to delete post: ' + error.message });
  }
});

// Tenant-specific API for deleting blog posts
app.delete('/api/:tenantId/posts/:pageType/:id', (req, res) => {
  try {
    // Verify password from request headers
    const password = req.headers['x-password'];
    const pageType = req.params.pageType;
    const tenantId = req.params.tenantId;
    
    console.log(`Delete request for tenant ${tenantId} with password:`, password);
    
    // Get the tenant-specific password
    const tenantPassword = getTenantPassword(tenantId);
    
    // Check if password matches the tenant's password
    if (password !== tenantPassword) {
      console.log('Delete password verification failed');
      return res.status(403).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Get tenant-specific data file
    const tenantDir = path.join(tenantsDir, tenantId);
    
    // Determine which data file to use
    let dataFile;
    if (pageType === 'main') {
      dataFile = path.join(tenantDir, 'main-posts.json');
    } else if (pageType === 'secondary') {
      dataFile = path.join(tenantDir, 'secondary-posts.json');
    } else {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }
    
    const postId = parseInt(req.params.id);
    
    // Check if the data file exists
    if (!fs.existsSync(dataFile)) {
      return res.status(404).json({ success: false, message: 'No posts found for this tenant and page type' });
    }
    
    // Read the current data
    const blogData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    
    // Find the post to delete first (to get file paths)
    const postToDelete = blogData.posts.find(post => post.id === postId);
    
    // If we have a post and it has custom files, delete them
    if (postToDelete) {
      // Delete image file if it's not the default
      if (postToDelete.image && postToDelete.image !== 'content-efs/images/default.jpeg') {
        const imagePath = path.join(__dirname, 'public', postToDelete.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`Deleted image: ${imagePath}`);
        }
      }
      
      // Delete PDF file if it's not the default
      if (postToDelete.pdf && postToDelete.pdf !== 'content-efs/pdfs/default.pdf') {
        const pdfPath = path.join(__dirname, 'public', postToDelete.pdf);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`Deleted PDF: ${pdfPath}`);
        }
      }
    } else {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Filter out the post to be deleted
    const updatedPosts = blogData.posts.filter(post => post.id !== postId);
    
    // Update the data object
    blogData.posts = updatedPosts;
    
    // Write back to the file
    fs.writeFileSync(dataFile, JSON.stringify(blogData, null, 2));
    
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant post:', error);
    res.status(500).json({ success: false, message: 'Failed to delete post: ' + error.message });
  }
});








// 


// API endpoint for tenant registration/configuration
app.post('/api/register-tenant', (req, res) => {
  try {
    const { tenantId, name, adminPassword, siteName } = req.body;
    const adminCode = req.headers['x-admin-code'];
    
    // Check admin code (a simple way to limit who can create tenants)
    if (adminCode !== 'admin123') {
      return res.status(403).json({
        success: false,
        message: 'Invalid admin code'
      });
    }
    
    // Validate tenant ID (only allow alphanumeric and hyphens)
    if (!tenantId || !/^[a-zA-Z0-9-]+$/.test(tenantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID. Use only letters, numbers, and hyphens.'
      });
    }
    
    // Check if tenant already exists
    const tenantConfigPath = path.join(tenantsDir, `${tenantId}-config.json`);
    if (fs.existsSync(tenantConfigPath)) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID already exists'
      });
    }
    
    // Create tenant configuration
    const tenantConfig = {
      id: tenantId,
      name: name || tenantId,
      siteName: siteName || `${tenantId}'s Blog`,
      password: adminPassword || 'thisMind', // Default password if none provided
      created: new Date().toISOString()
    };
    
    // Create tenant directory
    const tenantDir = path.join(tenantsDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    
    // Create tenant config file
    fs.writeFileSync(tenantConfigPath, JSON.stringify(tenantConfig, null, 2));
    
    // Create tenant image and PDF directories
    const tenantImagesDir = path.join(imagesDir, tenantId);
    const tenantPdfsDir = path.join(pdfsDir, tenantId);
    
    if (!fs.existsSync(tenantImagesDir)) {
      fs.mkdirSync(tenantImagesDir, { recursive: true });
    }
    
    if (!fs.existsSync(tenantPdfsDir)) {
      fs.mkdirSync(tenantPdfsDir, { recursive: true });
    }
    
    // Create default data files
    const defaultData = { 
      posts: [],
      about: `Welcome to ${tenantConfig.name}'s blog!`,
      content: ''
    };
    
    const mainDataFile = path.join(tenantDir, 'main-posts.json');
    const secondaryDataFile = path.join(tenantDir, 'secondary-posts.json');
    const aboutDataFile = path.join(tenantDir, 'about-content.json');
    
    // Create sample content for the about page
    const aboutContent = {
      posts: [],
      about: '',
      content: `<h1>Welcome to ${tenantConfig.name}'s Blog</h1>
<p>This is a customizable blog page where you can share your thoughts, stories, and ideas.</p>
<p>Use the navigation menu to explore different sections of the blog:</p>
<ul>
  <li><strong>Main Blog</strong> - Your primary content</li>
  <li><strong>Secondary Blog</strong> - Additional content or a different topic</li>
  <li><strong>About</strong> - Information about you or this blog</li>
</ul>
<p>To get started, click the "Add New Post" button on either the Main or Secondary blog pages.</p>`
    };
    
    // Write the default data files
    fs.writeFileSync(mainDataFile, JSON.stringify(defaultData, null, 2));
    fs.writeFileSync(secondaryDataFile, JSON.stringify(defaultData, null, 2));
    fs.writeFileSync(aboutDataFile, JSON.stringify(aboutContent, null, 2));
    
    res.json({
      success: true,
      message: 'Tenant registered successfully',
      tenant: {
        id: tenantId,
        name: tenantConfig.name,
        url: `/${tenantId}`
      }
    });
  } catch (error) {
    console.error('Error registering tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register tenant: ' + error.message
    });
  }
});

// API endpoint to list all tenants
app.get('/api/tenants', (req, res) => {
  try {
    const adminCode = req.headers['x-admin-code'];
    
    // Check admin code
    if (adminCode !== 'admin123') {
      return res.status(403).json({
        success: false,
        message: 'Invalid admin code'
      });
    }
    
    // Read all tenant configuration files
    const tenants = [];
    const files = fs.readdirSync(tenantsDir);
    
    files.forEach(file => {
      if (file.endsWith('-config.json')) {
        const configPath = path.join(tenantsDir, file);
        const tenantConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Add tenant info without password
        tenants.push({
          id: tenantConfig.id,
          name: tenantConfig.name,
          siteName: tenantConfig.siteName,
          created: tenantConfig.created,
          url: `/${tenantConfig.id}`
        });
      }
    });
    
    res.json({
      success: true,
      tenants: tenants
    });
  } catch (error) {
    console.error('Error listing tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list tenants: ' + error.message
    });
  }
});















// API endpoint to delete a tenant
app.delete('/api/tenant/:tenantId', (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const adminCode = req.headers['x-admin-code'];
    
    // Check admin code
    if (adminCode !== 'admin123') {
      return res.status(403).json({
        success: false,
        message: 'Invalid admin code'
      });
    }
    
    // Check if tenant exists
    const tenantConfigPath = path.join(tenantsDir, `${tenantId}-config.json`);
    if (!fs.existsSync(tenantConfigPath)) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    // Delete tenant config file
    fs.unlinkSync(tenantConfigPath);
    
    // Delete tenant data directory and files
    const tenantDir = path.join(tenantsDir, tenantId);
    if (fs.existsSync(tenantDir)) {
      // Delete all files in the directory
      const files = fs.readdirSync(tenantDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(tenantDir, file));
      });
      
      // Delete the directory
      fs.rmdirSync(tenantDir);
    }
    
    // Delete tenant-specific image directory
    const tenantImagesDir = path.join(imagesDir, tenantId);
    if (fs.existsSync(tenantImagesDir)) {
      try {
        // Delete all files in the directory
        const imageFiles = fs.readdirSync(tenantImagesDir);
        imageFiles.forEach(file => {
          fs.unlinkSync(path.join(tenantImagesDir, file));
        });
        
        // Delete the directory
        fs.rmdirSync(tenantImagesDir);
      } catch (error) {
        console.error(`Error deleting tenant images directory: ${error.message}`);
      }
    }
    
    // Delete tenant-specific PDF directory
    const tenantPdfsDir = path.join(pdfsDir, tenantId);
    if (fs.existsSync(tenantPdfsDir)) {
      try {
        // Delete all files in the directory
        const pdfFiles = fs.readdirSync(tenantPdfsDir);
        pdfFiles.forEach(file => {
          fs.unlinkSync(path.join(tenantPdfsDir, file));
        });
        
        // Delete the directory
        fs.rmdirSync(tenantPdfsDir);
      } catch (error) {
        console.error(`Error deleting tenant PDFs directory: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Tenant ${tenantId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tenant: ' + error.message
    });
  }
});























// Error handling middleware for multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 300MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    // Another error occurred
    return res.status(500).json({
      success: false,
      message: `Server error: ${err.message}`
    });
  }
  next();
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Multi-tenant blog system is ready. Visit /:tenantId for tenant blogs.`);
  console.log(`Admin interface available at http://localhost:${PORT}/admin`);
});