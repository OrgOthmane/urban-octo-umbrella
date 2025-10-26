<?php
session_start();

if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login-admin.php');
    exit();
}

require_once 'config.php';

$message = '';
$message_type = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['id_produit'])) {
    $id = $_POST['id_produit'];

    $stmt = $pdo->prepare("DELETE FROM Produit_Taille WHERE id_produit = ?");
    $stmt->execute([$id]);

    $stmt = $pdo->prepare("DELETE FROM Produit_Couleur WHERE id_produit = ?");
    $stmt->execute([$id]);

    $stmt = $pdo->prepare("DELETE FROM Produit_Image WHERE id_produit = ?");
    $stmt->execute([$id]);

    $stmt = $pdo->prepare("DELETE FROM Produits WHERE id_produit = ?");
    $stmt->execute([$id]);

    $message = 'Produit supprimé avec succès !';
    $message_type = 'success';
}

$stmt = $pdo->query("SELECT p.*, c.nom as nom_categorie FROM Produits p LEFT JOIN Categories c ON p.id_categorie = c.id_categorie");
$produits = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($produits as &$produit) {
    $stmt = $pdo->prepare("SELECT url_image FROM Produit_Image WHERE id_produit = ?");
    $stmt->execute([$produit['id_produit']]);
    $produit['image'] = $stmt->fetchColumn();
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supprimer Produit - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        .header {
            background: white;
            padding: 20px 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }

        .header h1 {
            color: #1f2937;
            font-size: 28px;
        }

        .back-link {
            display: inline-block;
            margin-top: 10px;
            color: #6b7280;
            text-decoration: none;
            font-size: 14px;
        }

        .back-link:hover {
            color: #dc2626;
        }

        .message {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
            text-align: center;
            font-weight: 500;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }

        .message.success {
            background: #d1fae5;
            color: #065f46;
            border: 2px solid #10b981;
        }

        .products-container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }

        .products-container h2 {
            color: #1f2937;
            margin-bottom: 25px;
            font-size: 22px;
        }

        .products-grid {
            display: grid;
            gap: 20px;
        }

        .product-card {
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            gap: 20px;
            align-items: center;
            transition: all 0.3s ease;
        }

        .product-card:hover {
            border-color: #dc2626;
            box-shadow: 0 5px 15px rgba(220, 38, 38, 0.1);
        }

        .product-image {
            width: 100px;
            height: 100px;
            border-radius: 8px;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
        }

        .product-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .product-image.no-image {
            font-size: 40px;
            color: #d1d5db;
        }

        .product-info {
            flex: 1;
        }

        .product-info h3 {
            color: #1f2937;
            font-size: 18px;
            margin-bottom: 8px;
        }

        .product-details {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 5px;
        }

        .product-category {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 8px;
        }

        .product-price {
            color: #dc2626;
            font-size: 20px;
            font-weight: 700;
            margin-right: 20px;
        }

        .product-stock {
            color: #6b7280;
            font-size: 14px;
        }

        .delete-btn {
            padding: 12px 25px;
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .delete-btn:hover {
            background: #b91c1c;
            transform: translateY(-2px);
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
        }

        .empty-state h3 {
            font-size: 24px;
            margin-bottom: 10px;
        }

        @media (max-width: 768px) {
            .product-card {
                flex-direction: column;
                align-items: flex-start;
            }

            .delete-btn {
                width: 100%;
                text-align: center;
            }
        }
    </style>
</head>
<body>
 <div class="container">
        <div class="header">
            <h1>🗑️ Supprimer un Produit</h1>
            <a href="dashboard.php" class="back-link">← Retour au dashboard</a>
        </div>

        <?php if (!empty($message)): ?>
            <div class="message <?php echo $message_type; ?>">
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <div class="products-container">
            <h2>Liste des produits</h2>
            <?php if (count($produits) > 0): ?>
                <div class="products-grid">
                    <?php foreach ($produits as $p): ?>
                        <div class="product-card">
                            <div class="product-image <?php echo empty($p['image']) ? 'no-image' : ''; ?>">
                                <?php if (!empty($p['image'])): ?>
                                    <img src="<?php echo htmlspecialchars($p['image']); ?>" 
                                         alt="<?php echo htmlspecialchars($p['nom']); ?>"
                                         onerror="this.parentElement.innerHTML='⚽'">
                                <?php else: ?>
                                    ⚽
                                <?php endif; ?>
                            </div>
                            <div class="product-info">
                                <h3><?php echo htmlspecialchars($p['nom']); ?></h3>
                                <?php if (!empty($p['description'])): ?>
                                    <div class="product-details">
                                        <?php echo substr(htmlspecialchars($p['description']), 0, 80); ?>...
                                    </div>
                                <?php endif; ?>
                                <?php if (!empty($p['nom_categorie'])): ?>
                                    <span class="product-category"><?php echo htmlspecialchars($p['nom_categorie']); ?></span>
                                <?php endif; ?>
                            </div>
                            <div style="text-align:right;">
                                <div class="product-price"><?php echo number_format($p['prix'],2); ?> MAD</div>
                                <div class="product-stock">Stock: <?php echo $p['quantite']; ?></div>
                            </div>
                            <form method="post" style="display:inline;" onsubmit="return confirm('Êtes-vous sûr de vouloir supprimer <?php echo htmlspecialchars($p['nom']); ?> ?');">
                                <input type="hidden" name="id_produit" value="<?php echo $p['id_produit']; ?>">
                                <button type="submit" class="delete-btn">Supprimer</button>
                            </form>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php else: ?>
                <div class="empty-state">
                    <h3>Aucun produit disponible</h3>
                    <p>La liste des produits est vide</p>
                </div>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
