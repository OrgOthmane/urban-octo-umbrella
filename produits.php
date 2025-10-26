<?php
session_start();
require_once 'config.php';

try {
    $stmt = $pdo->query("
        SELECT p.*, c.nom as nom_categorie 
        FROM Produits p 
        LEFT JOIN Categories c ON p.id_categorie = c.id_categorie 
        WHERE p.quantite > 0
        ORDER BY p.id_produit DESC
    ");
    $produits = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    for ($i = 0; $i < count($produits); $i++) {
        $stmt_img = $pdo->prepare("SELECT url_image FROM Produit_Image WHERE id_produit = ? LIMIT 1");
        $stmt_img->execute([$produits[$i]['id_produit']]);
        $image = $stmt_img->fetchColumn();
        $produits[$i]['image'] = $image ? $image : '';
    }
} catch (PDOException $e) {
    $produits = array();
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nos Produits - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: #f9fafb;
            min-height: 100vh;
        }

        .header {
            background: white;
            padding: 20px 0;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            font-size: 24px;
            font-weight: 700;
            color: #1f2937;
        }

        .nav-links {
            display: flex;
            gap: 15px;
            align-items: center;
        }

        .nav-link {
            padding: 10px 20px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .nav-link:hover {
            background: #2563eb;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        .page-title {
            text-align: center;
            margin-bottom: 40px;
        }

        .page-title h1 {
            font-size: 36px;
            color: #1f2937;
            margin-bottom: 10px;
        }

        .page-title p {
            font-size: 18px;
            color: #6b7280;
        }

        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 30px;
        }

        .product-card {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            transition: all 0.3s ease;
        }

        .product-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
        }

        .product-image {
            width: 100%;
            height: 260px;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
        }

        .product-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .product-image.no-image {
            font-size: 70px;
            color: #d1d5db;
        }

        .category-tag {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(59, 130, 246, 0.9);
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .stock-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .product-body {
            padding: 20px;
        }

        .product-name {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 10px;
            line-height: 1.4;
        }

        .product-description {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 10px;
            line-height: 1.5;
            height: 42px;
            overflow: hidden;
        }

        .product-info {
            font-size: 13px;
            color: #6b7280;
            margin-bottom: 5px;
        }

        .product-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 15px;
        }

        .product-price {
            font-size: 24px;
            font-weight: 700;
            color: #dc2626;
        }

        .add-to-cart {
            padding: 10px 20px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .add-to-cart:hover {
            background: #059669;
            transform: scale(1.05);
        }

        .empty-state {
            text-align: center;
            padding: 80px 20px;
        }

        .empty-state h2 {
            font-size: 28px;
            color: #1f2937;
            margin-bottom: 10px;
        }

        .empty-state p {
            font-size: 16px;
            color: #6b7280;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
        }

        .modal-content h2 {
            margin-bottom: 10px;
            color: #333;
        }

        .modal-product-name {
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .modal-group {
            margin-bottom: 20px;
        }

        .modal-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #333;
        }

        .modal-group select,
        .modal-group input {
            width: 100%;
            padding: 10px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
        }

        .modal-group small {
            display: block;
            margin-top: 5px;
            color: #10b981;
            font-weight: 600;
        }

        .modal-buttons {
            display: flex;
            gap: 10px;
            margin-top: 25px;
        }

        .btn-modal {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
        }

        .btn-confirm {
            background: #10b981;
            color: white;
        }

        .btn-cancel {
            background: #6c757d;
            color: white;
        }

        @media (max-width: 768px) {
            .products-grid {
                grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                gap: 20px;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-container">
            <div class="logo">⚽ ProFoot</div>
            <div class="nav-links">
                <?php if (isset($_SESSION['client_logged_in'])): ?>
                    <span style="color: #666;">Bonjour, <?php echo $_SESSION['client_nom']; ?></span>
                    <a href="panier.php" class="nav-link">🛒 Panier</a>
                    <a href="logout-client.php" class="nav-link">Déconnexion</a>
                <?php else: ?>
                    <a href="login-client.php" class="nav-link">Connexion</a>
                <?php endif; ?>
            </div>
        </div>
    </header>

    <div class="container">
        <div class="page-title">
            <h1>Nos Produits</h1>
            <p>Découvrez notre collection de produits de football</p>
        </div>

        <?php if (isset($_SESSION['error_message'])): ?>
            <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px solid #f5c6cb;">
                <?php 
                echo $_SESSION['error_message']; 
                unset($_SESSION['error_message']);
                ?>
            </div>
        <?php endif; ?>

        <?php if (count($produits) > 0): ?>
            <div class="products-grid">
                <?php foreach ($produits as $produit): ?>
                    <div class="product-card">
                        <div class="product-image <?php echo empty($produit['image']) ? 'no-image' : ''; ?>">
                            <?php if (!empty($produit['image'])): ?>
                                <img src="<?php echo htmlspecialchars($produit['image']); ?>" 
                                     alt="<?php echo htmlspecialchars($produit['nom']); ?>"
                                     onerror="this.parentElement.classList.add('no-image'); this.style.display='none'; this.parentElement.innerHTML += '⚽'">
                            <?php else: ?>
                                ⚽
                            <?php endif; ?>
                            
                            <?php if (!empty($produit['nom_categorie'])): ?>
                                <div class="category-tag"><?php echo htmlspecialchars($produit['nom_categorie']); ?></div>
                            <?php endif; ?>
                            
                            <div class="stock-badge">Stock: <?php echo $produit['quantite']; ?></div>
                        </div>
                        
                        <div class="product-body">
                            <h3 class="product-name"><?php echo htmlspecialchars($produit['nom']); ?></h3>
                            
                            <?php if (!empty($produit['description'])): ?>
                                <p class="product-description">
                                    <?php echo htmlspecialchars($produit['description']); ?>
                                </p>
                            <?php endif; ?>
                            
                            <?php if ($produit['tailles']): ?>
                                <p class="product-info">Tailles: <?php echo htmlspecialchars($produit['tailles']); ?></p>
                            <?php endif; ?>
                            
                            <?php if ($produit['couleurs']): ?>
                                <p class="product-info">Couleurs: <?php echo htmlspecialchars($produit['couleurs']); ?></p>
                            <?php endif; ?>
                            
                            <div class="product-footer">
                                <div class="product-price">
                                    <?php echo number_format($produit['prix'], 2); ?> MAD
                                </div>
                                <?php if (isset($_SESSION['client_logged_in'])): ?>
                                    <button class="add-to-cart" onclick="showModal(<?php echo $produit['id_produit']; ?>, '<?php echo htmlspecialchars($produit['nom'], ENT_QUOTES); ?>', '<?php echo htmlspecialchars($produit['tailles'], ENT_QUOTES); ?>', <?php echo $produit['quantite']; ?>)">
                                        Ajouter
                                    </button>
                                <?php else: ?>
                                    <button class="add-to-cart" onclick="window.location.href='login-client.php'">
                                        Connexion
                                    </button>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <div class="empty-state">
                <h2>Aucun produit disponible</h2>
                <p>Revenez bientôt pour découvrir nos nouveaux produits</p>
            </div>
        <?php endif; ?>
    </div>

    <div class="modal" id="addModal">
        <div class="modal-content">
            <h2>Ajouter au panier</h2>
            <p class="modal-product-name" id="modalProductName"></p>
            
            <form id="addToCartForm" method="GET" action="panier.php">
                <input type="hidden" name="add" >
                <input type="hidden" name="id" id="modalProductId">
                
                <div class="modal-group">
                    <label>Taille *</label>
                    <input type="text" name="taille" id="modalTaille" required >
                    <small id="taillesInfo" style="color: #3b82f6;"></small>
                </div>
                
                <div class="modal-group">
                    <label>Quantité *</label>
                    <input type="number" name="qte" id="modalQuantite"  min="1" required>
                    <small id="stockInfo"></small>
                </div>
                
                <div class="modal-buttons">
                    <button type="button" class="btn-modal btn-cancel" onclick="closeModal()">Annuler</button>
                    <button type="submit" class="btn-modal btn-confirm">Ajouter au panier</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function showModal(id, nom, tailles, stock) {
            document.getElementById('modalProductId').value = id;
            document.getElementById('modalProductName').textContent = nom;
            document.getElementById('stockInfo').textContent = 'Stock disponible: ' + stock;
            document.getElementById('modalQuantite').max = stock;
            
            var tailleInput = document.getElementById('modalTaille');
            tailleInput.value = '';
            
            var taillesInfo = document.getElementById('taillesInfo');
            if (tailles && tailles.trim() !== '') {
                taillesInfo.textContent = 'Tailles disponibles: ' + tailles;
            } else {
                taillesInfo.textContent = '';
            }
            
            document.getElementById('addModal').classList.add('active');
        }
        
        function closeModal() {
            document.getElementById('addModal').classList.remove('active');
        }
        
        document.getElementById('addModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    </script>
</body>
</html>