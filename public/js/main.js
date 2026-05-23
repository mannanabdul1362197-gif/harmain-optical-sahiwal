let currentProducts = [];
let selectedProduct = null;
let lensTypes = [];

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-up, .fade-right, .fade-left, .product-card').forEach(el => observer.observe(el));

async function loadProducts(category = 'all') {
  const url = category === 'all' ? '/api/products' : `/api/products?category=${category}`;
  const res = await fetch(url);
  currentProducts = await res.json();
  renderProducts(currentProducts);
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!products.length) {
    grid.innerHTML = '<div class="loader-wrapper">No products found</div>';
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-img"><img src="${p.image_url || 'https://placehold.co/400x300/F3EFE8/C9A84C?text=Glasses'}" alt="${p.name}" onerror="this.src='https://placehold.co/400x300/F3EFE8/C9A84C?text=Glasses'"></div>
      <div class="product-info"><h3>${p.name}</h3><p>${p.description?.substring(0, 60)}...</p><div class="price">Rs ${p.price.toLocaleString()}</div><button class="order-btn" onclick="openOrderModal(${p.id})">Order Now <i class="fas fa-shopping-cart"></i></button></div>
    </div>
  `).join('');
}

async function loadLensTypes() {
  const res = await fetch('/api/lens-types');
  lensTypes = await res.json();
  renderLensOptions();
}

function renderLensOptions() {
  const container = document.getElementById('lensOptionsContainer');
  if (!container) return;
  if (!lensTypes.length) {
    container.innerHTML = '<div>No lens options available</div>';
    return;
  }
  container.innerHTML = lensTypes.map((lens, index) => `
    <label>
      <input type="radio" name="lensType" value="${lens.id}" data-price="${lens.price}" ${index === 0 ? 'checked' : ''}>
      ${lens.name} ${lens.price > 0 ? `(+Rs ${lens.price})` : '(Standard)'}
    </label>
  `).join('');
  document.querySelectorAll('input[name="lensType"]').forEach(radio => radio.addEventListener('change', updateTotalPrice));
  updateTotalPrice();
}

function updateTotalPrice() {
  const basePrice = selectedProduct?.price || 0;
  let lensExtra = 0;
  const selectedRadio = document.querySelector('input[name="lensType"]:checked');
  if (selectedRadio) lensExtra = parseFloat(selectedRadio.dataset.price) || 0;
  const total = basePrice + lensExtra;
  const totalDisplay = document.getElementById('totalPriceDisplay');
  if (totalDisplay) totalDisplay.innerText = `Rs ${total.toLocaleString()}`;
}

async function openOrderModal(productId) {
  const res = await fetch(`/api/products/${productId}`);
  selectedProduct = await res.json();
  const modal = document.getElementById('orderModal');
  document.getElementById('selectedProductInfo').innerHTML = `
    <div style="display:flex; gap:15px; align-items:center; background:#F8F4EC; padding:15px; border-radius:20px; margin-bottom:20px;">
      <img src="${selectedProduct.image_url || 'https://placehold.co/80x60/F3EFE8/C9A84C?text=Glass'}" style="width:70px; height:60px; object-fit:cover; border-radius:16px;">
      <div><strong>${selectedProduct.name}</strong><br>Base Price: Rs ${selectedProduct.price}</div>
    </div>
  `;
  modal.style.display = 'flex';
  await loadLensTypes();
}

document.getElementById('orderForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const customerName = document.getElementById('customerName').value;
  const customerPhone = document.getElementById('customerPhone').value;
  const customerAddress = document.getElementById('customerAddress').value;
  if (!customerName || !customerPhone) {
    alert('Please enter name and phone number');
    return;
  }

  const prescriptionData = {
    right: { sph: document.getElementById('sph_r').value, cyl: document.getElementById('cyl_r').value, axis: document.getElementById('axis_r').value },
    left: { sph: document.getElementById('sph_l').value, cyl: document.getElementById('cyl_l').value, axis: document.getElementById('axis_l').value },
    pd: document.getElementById('pd').value,
    add: document.getElementById('add').value
  };
  const selectedRadio = document.querySelector('input[name="lensType"]:checked');
  const lensId = selectedRadio ? parseInt(selectedRadio.value) : null;
  const lensObj = lensTypes.find(l => l.id === lensId);
  const lensName = lensObj ? lensObj.name : 'Standard';
  const lensExtra = lensObj ? lensObj.price : 0;
  const totalPrice = selectedProduct.price + lensExtra;

  const orderData = {
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_address: customerAddress,
    product_id: selectedProduct.id,
    product_snapshot: { name: selectedProduct.name, price: selectedProduct.price, image: selectedProduct.image_url },
    prescription_data: prescriptionData,
    lens_options: { id: lensId, name: lensName, extra: lensExtra },
    total_price: totalPrice
  };

  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  const result = await res.json();
  if (res.ok) {
    const msg = `New Order: ${result.order_number}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nProduct: ${selectedProduct.name}\nTotal: Rs ${totalPrice}\nPrescription: OD: ${prescriptionData.right.sph} / ${prescriptionData.right.cyl} x ${prescriptionData.right.axis}, OS: ${prescriptionData.left.sph} / ${prescriptionData.left.cyl} x ${prescriptionData.left.axis}\nLens: ${lensName} (+Rs ${lensExtra})\nAddress: ${customerAddress}`;
    window.open(`https://wa.me/923142724592?text=${encodeURIComponent(msg)}`, '_blank');
    alert('Order placed! Our team will contact you shortly on WhatsApp.');
    document.getElementById('orderModal').style.display = 'none';
    document.getElementById('orderForm').reset();
  } else {
    alert('Error placing order: ' + result.error);
  }
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
  document.getElementById('orderModal').style.display = 'none';
});
window.onclick = (e) => {
  if (e.target === document.getElementById('orderModal')) document.getElementById('orderModal').style.display = 'none';
};

document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadProducts(btn.dataset.category);
  });
});

document.querySelector('.mobile-toggle')?.addEventListener('click', () => {
  const navLinks = document.querySelector('.nav-links');
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
});

loadProducts();
loadLensTypes();