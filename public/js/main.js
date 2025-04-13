// Client-side functionality for the blog
let currentPostIdToDelete = null;
let currentPageType = 'main'; // Default to main blog
let tenantId = 'default'; // Default tenant ID

document.addEventListener('DOMContentLoaded', function() {
  // Check for tenant ID from the server-rendered variable
  if (typeof TENANT_ID !== 'undefined') {
    tenantId = TENANT_ID;
  } else {
    // Try to determine tenant from URL path
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== 'secondary' && pathParts[0] !== 'about') {
      tenantId = pathParts[0];
    }
  }
  
  console.log('Current tenant ID:', tenantId);
  
  // Initialize the delete functionality
  setupDeleteFunctionality();
  
  // Determine the current page type
  const path = window.location.pathname;
  if (tenantId !== 'default') {
    // For tenant pages
    if (path.endsWith('/secondary')) {
      currentPageType = 'secondary';
    } else if (path.endsWith('/about')) {
      currentPageType = 'about';
    } else {
      currentPageType = 'main';
    }
  } else {
    // For default site
    if (path === '/') {
      currentPageType = 'main';
    } else if (path === '/secondary') {
      currentPageType = 'secondary';
    } else if (path === '/about') {
      currentPageType = 'about';
    }
  }
  
  console.log('Current page type:', currentPageType);
  
  // Highlight active navigation link
  highlightActiveNavLink();
  
  // Show/hide Add Post button based on page type
  toggleAddPostButton();
});

// Highlight the active navigation link
function highlightActiveNavLink() {
  // Remove active class from all links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Add active class to current page link
  const currentLink = document.querySelector(`.nav-link[data-page="${currentPageType}"]`);
  if (currentLink) {
    currentLink.classList.add('active');
  }
}

// Show/hide Add Post button based on page type
function toggleAddPostButton() {
  const addPostBtn = document.querySelector('.add-post-btn');
  if (addPostBtn) {
    if (currentPageType === 'about') {
      addPostBtn.style.display = 'none';
    } else {
      addPostBtn.style.display = 'flex';
    }
  }
}

// Setup delete functionality
function setupDeleteFunctionality() {
  // Use event delegation to handle all delete buttons
  document.addEventListener('click', function(event) {
    // Check if the clicked element is a delete button
    if (event.target.classList.contains('delete-btn')) {
      // Get the post ID from the data attribute
      const postId = parseInt(event.target.getAttribute('data-post-id'));
      if (!isNaN(postId)) {
        confirmDelete(postId);
      } else {
        console.error('Invalid post ID:', event.target.getAttribute('data-post-id'));
      }
    }
  });
}

// Show delete confirmation modal
function confirmDelete(postId) {
  console.log('Confirming delete for post ID:', postId);
  currentPostIdToDelete = postId;
  const modal = document.getElementById('confirmDeleteModal');
  modal.style.display = 'flex';
  
  // Prevent body scrolling while modal is open
  document.body.style.overflow = 'hidden';
  
  // Clear any previously entered password
  if (document.getElementById('deletePassword')) {
    document.getElementById('deletePassword').value = '';
  }
}

// Close delete confirmation modal
function closeDeleteModal() {
  const modal = document.getElementById('confirmDeleteModal');
  modal.style.display = 'none';
  currentPostIdToDelete = null;
  
  // Restore body scrolling
  document.body.style.overflow = '';
}

// Delete the post
async function deletePost() {
  if (!currentPostIdToDelete) {
    console.error('No post ID to delete');
    return;
  }
  
  // Get password from input
  const password = document.getElementById('deletePassword').value;
  if (!password) {
    alert('Please enter the password');
    return;
  }
  
  console.log('Deleting post with ID:', currentPostIdToDelete);
  
  try {
    // Construct the appropriate API endpoint based on tenant
    let endpoint = `/api/posts/${currentPageType}/${currentPostIdToDelete}`;
    if (tenantId !== 'default') {
      endpoint = `/api/${tenantId}/posts/${currentPageType}/${currentPostIdToDelete}`;
    }
    
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Password': password
      }
    });
    
    // Check if response status is 403 (Forbidden - incorrect password)
    if (response.status === 403) {
      const result = await response.json();
      alert(result.message || 'Invalid password');
      return;
    }
    
    const result = await response.json();
    
    if (result.success) {
      // Remove the post from the DOM
      const postElement = document.querySelector(`.blog-post[data-post-id="${currentPostIdToDelete}"]`);
      if (postElement) {
        postElement.remove();
      }
      
      // Close the modal
      closeDeleteModal();
      
      // Refresh the page to get the updated list from the server
      window.location.reload();
    } else {
      console.error('Failed to delete post:', result.message);
      alert('Failed to delete post: ' + result.message);
    }
  } catch (error) {
    console.error('Error deleting post:', error);
    alert('An error occurred while deleting the post.');
  }
}

// Show add post modal
function showAddPostModal(pageType) {
  const modal = document.getElementById('addPostModal');
  modal.style.display = 'flex';
  
  // Set the page type for the post
  document.getElementById('postPageType').value = pageType || currentPageType;
  
  // Clear the form
  document.getElementById('addPostForm').reset();
  
  // Prevent body scrolling while modal is open
  document.body.style.overflow = 'hidden';
}

// Close add post modal
function closeAddPostModal() {
  const modal = document.getElementById('addPostModal');
  modal.style.display = 'none';
  
  // Restore body scrolling
  document.body.style.overflow = '';
}

// Add new post
async function addNewPost(event) {
  event.preventDefault();
  
  const title = document.getElementById('postTitle').value.trim();
  const description = document.getElementById('postDescription').value.trim();
  const password = document.getElementById('postPassword').value;
  const pageType = document.getElementById('postPageType').value;
  const imageFile = document.getElementById('postImage').files[0];
  const pdfFile = document.getElementById('postPdf').files[0];
  
  if (!title || !description || !password) {
    alert('Please fill in all required fields including password');
    return false;
  }
  
  try {
    // Create a FormData object to handle file uploads
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('password', password);
    
    // Append files if selected
    if (imageFile) {
      formData.append('image', imageFile);
    }
    
    if (pdfFile) {
      formData.append('pdf', pdfFile);
    }
    
    // Show loading state or disable the button if needed
    const submitButton = document.querySelector('#addPostForm .submit-btn');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading...';
    }
    
    // Construct the appropriate API endpoint based on tenant
    let endpoint = `/api/posts/${pageType}`;
    if (tenantId !== 'default') {
      endpoint = `/api/${tenantId}/posts/${pageType}`;
    }
    
    // Log the FormData for debugging
    console.log('FormData created, sending to:', endpoint);
    
    // Send the FormData with files using fetch
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
      // Don't set Content-Type header when using FormData, 
      // browser will set it automatically with the boundary
    });
    
    // Log the response status for debugging
    console.log('Response status:', response.status);
    
    // Check if response status is 403 (Forbidden - incorrect password)
    if (response.status === 403) {
      const result = await response.json();
      alert(result.message || 'Invalid password');
      
      // Reset button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Add Post';
      }
      return false;
    }
    
    const result = await response.json();
    console.log('Response result:', result);
    
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Add Post';
    }
    
    if (result.success) {
      // Close the modal
      closeAddPostModal();
      
      // Refresh the page to show the new post
      window.location.reload();
    } else {
      console.error('Failed to add post:', result.message);
      alert('Failed to add post: ' + result.message);
    }
  } catch (error) {
    console.error('Error adding post:', error);
    alert('An error occurred while adding the post: ' + error.message);
    
    // Reset button
    const submitButton = document.querySelector('#addPostForm .submit-btn');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Add Post';
    }
  }
  
  return false;
}

// Show edit about modal
function showEditAboutModal(pageType) {
  const modal = document.getElementById('editAboutModal');
  modal.style.display = 'flex';
  
  // Set the page type
  document.getElementById('aboutPageType').value = pageType || currentPageType;
  
  // Clear the form
  document.getElementById('editAboutForm').reset();
  
  // Load current about content
  loadAboutContent(pageType || currentPageType);
  
  // Prevent body scrolling while modal is open
  document.body.style.overflow = 'hidden';
}

// Load about content for editing
async function loadAboutContent(pageType) {
  try {
    // Construct the appropriate API endpoint based on tenant
    let endpoint = `/api/posts/${pageType}`;
    if (tenantId !== 'default') {
      endpoint = `/api/${tenantId}/posts/${pageType}`;
    }
    
    const response = await fetch(endpoint);
    const data = await response.json();
    
    // Populate the textarea with current content
    const aboutContent = pageType === 'about' ? data.content || '' : data.about || '';
    document.getElementById('aboutContent').value = aboutContent;
  } catch (error) {
    console.error('Error loading about content:', error);
    alert('Failed to load current content');
  }
}

// Close edit about modal
function closeEditAboutModal() {
  const modal = document.getElementById('editAboutModal');
  modal.style.display = 'none';
  
  // Restore body scrolling
  document.body.style.overflow = '';
}

// Update about content
async function updateAboutContent(event) {
  event.preventDefault();
  
  const content = document.getElementById('aboutContent').value;
  const password = document.getElementById('aboutPassword').value;
  const pageType = document.getElementById('aboutPageType').value;
  
  if (!password) {
    alert('Please enter the password');
    return false;
  }
  
  try {
    // Show loading state
    const submitButton = event.target.querySelector('.submit-btn');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Updating...';
    }
    
    // Construct the appropriate API endpoint based on tenant
    let endpoint = `/api/about/${pageType}`;
    if (tenantId !== 'default') {
      endpoint = `/api/${tenantId}/about/${pageType}`;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
        password: password
      })
    });
    
    // Check if response status is 403 (Forbidden - incorrect password)
    if (response.status === 403) {
      const result = await response.json();
      alert(result.message || 'Invalid password');
      
      // Reset button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Update';
      }
      return false;
    }
    
    const result = await response.json();
    
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Update';
    }
    
    if (result.success) {
      // Close the modal
      closeEditAboutModal();
      
      // Refresh the page to show the updated content
      window.location.reload();
    } else {
      console.error('Failed to update content:', result.message);
      alert('Failed to update content: ' + result.message);
    }
  } catch (error) {
    console.error('Error updating content:', error);
    alert('An error occurred while updating the content.');
    
    // Reset button
    const submitButton = event.target.querySelector('.submit-btn');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Update';
    }
  }
  
  return false;
}