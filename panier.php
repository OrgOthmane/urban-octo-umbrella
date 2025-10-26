<?php
session_start();
require_once 'config.php';

if (!isset($_SESSION['client_logged_in'])) {
    header('Location: login-client.php');
    exit();
}

$id_client = $_SESSION['client_id'];
$message = '';

$stmt = $pdo->prepare("SELECT id_panier FROM Panier WHERE id_client = ? ORDER BY date_creation DESC LIMIT 1");
$stmt->execute([$id_client]);
$panier = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$panier) {
    $stmt = $pdo->prepare("INSERT INTO Panier (id_client, date_creation) VALUES (?, CURDATE())");
    $stmt->execute([$id_client]);
    $id_panier = $pdo->lastInsertId();
} else {
    $id_panier = $panier['id_panier'];
}

if (isset($_GET['add']) && isset($_GET['id'])) {
    $id_produit = $_GET['id'];
    $quantite = isset($_GET['qte']) ? (int)$_GET['qte'] : 1;
    $taille = isset($_GET['taille']) ? trim($_GET['taille']) : '';
    
    $stmt = $pdo->prepare("SELECT quantite FROM Produits WHERE id_produit = ?");
    $stmt->execute([$id_produit]);
    $produit = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($produit && $produit['quantite'] >= $quantite) {
        $stmt = $pdo->prepare("SELECT quantite FROM Panier_Produit WHERE id_panier = ? AND id_produit = ?");
        $stmt->execute([$id_panier, $id_produit]);
        $existe = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existe) {
            $nouvelle_qte = $existe['quantite'] + $quantite;
            $stmt = $pdo->prepare("UPDATE Panier_Produit SET quantite = ? WHERE id_panier = ? AND id_produit = ?");
            $stmt->execute([$nouvelle_qte, $id_panier, $id_produit]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO Panier_Produit (id_panier, id_produit, quantite) VALUES (?, ?, ?)");
            $stmt->execute([$id_panier, $id_produit, $quantite]);
        }
        
        $stmt = $pdo->prepare("UPDATE Produits SET quantite = quantite - ? WHERE id_produit = ?");
        $stmt->execute([$quantite, $id_produit]);
        
        $message = "Produit ajouté au panier ! (Taille: $taille, Qté: $quantite)";
    } else {
        $message = 'Stock insuffisant pour cette quantité';
    }
}

if (isset($_GET['remove'])) {
    $id_produit = $_GET['remove'];
    
    $stmt = $pdo->prepare("SELECT quantite FROM Panier_Produit WHERE id_panier = ? AND id_produit = ?");
    $stmt->execute([$id_panier, $id_produit]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($item) {
        $stmt = $pdo->prepare("UPDATE Produits SET quantite = quantite + ? WHERE id_produit = ?");
        $stmt->execute([$item['quantite'], $id_produit]);
        $stmt = $pdo->prepare("DELETE FROM Panier_Produit WHERE id_panier = ? AND id_produit = ?");
        $stmt->execute([$id_panier, $id_produit]);
    }
    
    $message = 'Produit retire du panier';
}
if (isset($_POST['update_qte'])) {
    $id_produit = $_POST['id_produit'];
    $nouvelle_quantite = (int)$_POST['quantite'];
    $stmt = $pdo->prepare("SELECT quantite FROM Panier_Produit WHERE id_panier = ? AND id_produit = ?");
    $stmt->execute([$id_panier, $id_produit]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($item) {
        $ancienne_qte = $item['quantite'];
        $difference = $nouvelle_quantite - $ancienne_qte;
        
        if ($difference > 0) {
            $stmt = $pdo->prepare("SELECT quantite FROM Produits WHERE id_produit = ?");
            $stmt->execute([$id_produit]);
            $produit = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($produit && $produit['quantite'] >= $difference) {
                $stmt = $pdo->prepare("UPDATE Produits SET quantite = quantite - ? WHERE id_produit = ?");
                $stmt->execute([$difference, $id_produit]);
                $stmt = $pdo->prepare("UPDATE Panier_Produit SET quantite = ? WHERE id_panier = ? AND id_produit = ?");
                $stmt->execute([$nouvelle_quantite, $id_panier, $id_produit]);
                $message = 'Quantité mise à jour';
            } else {
                $message = 'Stock insuffisant';
            }
        } elseif ($difference < 0) {
            $stmt = $pdo->prepare("UPDATE Produits SET quantite = quantite + ? WHERE id_produit = ?");
            $stmt->execute([abs($difference), $id_produit]);
            
            if ($nouvelle_quantite > 0) {
                $stmt = $pdo->prepare("UPDATE Panier_Produit SET quantite = ? WHERE id_panier = ? AND id_produit = ?");
                $stmt->execute([$nouvelle_quantite, $id_panier, $id_produit]);
            } else {
                $stmt = $pdo->prepare("DELETE FROM Panier_Produit WHERE id_panier = ? AND id_produit = ?");
                $stmt->execute([$id_panier, $id_produit]);
            }
            $message = 'Quantite mise a jour';
        }
    }
}
$stmt = $pdo->prepare("
    SELECT p.*, pp.quantite as qte_panier, pi.url_image
    FROM Panier_Produit pp
    JOIN Produits p ON pp.id_produit = p.id_produit
    LEFT JOIN (
        SELECT id_produit, MIN(url_image) as url_image 
        FROM Produit_Image 
        GROUP BY id_produit
    ) pi ON p.id_produit = pi.id_produit
    WHERE pp.id_panier = ?
");
$stmt->execute([$id_panier]);
$produits_panier = $stmt->fetchAll(PDO::FETCH_ASSOC);

$total = 0;
foreach ($produits_panier as $prod) {
    $total += $prod['prix'] * $prod['qte_panier'];
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mon Panier - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }

        .header {
            background: white;
            padding: 20px 0;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
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
            font-weight: bold;
            color: #333;
        }

        .nav-links {
            display: flex;
            gap: 15px;
        }

        .nav-links a {
            padding: 8px 15px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 5px;
        }

        .container {
            max-width: 1200px;
            margin: 30px auto;
            padding: 0 20px;
        }

        h1 {
            margin-bottom: 20px;
            color: #333;
        }

        .message {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }

        .content {
            display: grid;
            grid-template-columns: 1fr 350px;
            gap: 20px;
        }

        .cart-items {
            background: white;
            padding: 20px;
            border-radius: 5px;
        }

        .cart-item {
            display: grid;
            grid-template-columns: 100px 1fr auto;
            gap: 20px;
            padding: 20px;
            border-bottom: 1px solid #ddd;
            align-items: center;
        }

        .cart-item:last-child {
            border-bottom: none;
        }

        .item-image {
            width: 100px;
            height: 100px;
            background: #f0f0f0;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .item-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .item-info h3 {
            margin-bottom: 10px;
            color: #333;
        }

        .item-info p {
            color: #666;
            font-size: 14px;
            margin-bottom: 5px;
        }

        .item-price {
            font-size: 20px;
            font-weight: bold;
            color: #dc2626;
            margin-top: 10px;
        }

        .item-actions {
            text-align: right;
        }

        .quantity-form {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
        }

        .quantity-form input {
            width: 60px;
            padding: 5px;
            text-align: center;
            border: 1px solid #ddd;
            border-radius: 3px;
        }

        .btn-update {
            padding: 5px 10px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }

        .btn-remove {
            padding: 8px 15px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
        }

        .summary {
            background: white;
            padding: 20px;
            border-radius: 5px;
            height: fit-content;
        }

        .summary h2 {
            margin-bottom: 20px;
            color: #333;
        }

        .summary-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #ddd;
        }

        .summary-total {
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            font-weight: bold;
            color: #333;
            margin-top: 20px;
        }

        .btn-checkout {
            width: 100%;
            padding: 15px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
        }

        .btn-checkout:hover {
            background: #218838;
        }

        .empty-cart {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }

        .empty-cart h2 {
            margin-bottom: 15px;
        }

        .empty-cart a {
            display: inline-block;
            padding: 12px 30px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }

        @media (max-width: 968px) {
            .content {
                grid-template-columns: 1fr;
            }

            .cart-item {
                grid-template-columns: 80px 1fr;
            }

            .item-actions {
                grid-column: 1 / -1;
                text-align: left;
                margin-top: 10px;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-container">
            <div class="logo">⚽ ProFoot</div>
            <div class="nav-links">
                <a href="produits.php">Continuer mes achats</a>
                <a href="logout-client.php">Déconnexion</a>
            </div>
        </div>
    </header>

    <div class="container">
        <h1>🛒 Mon Panier</h1>

        <?php if ($message): ?>
            <div class="message"><?php echo $message; ?></div>
        <?php endif; ?>

        <?php if (count($produits_panier) > 0): ?>
            <div class="content">
                <div class="cart-items">
                    <?php foreach ($produits_panier as $prod): ?>
                        <div class="cart-item">
                            <div class="item-image">
                                <?php if ($prod['url_image']): ?>
                                    <img src="<?php echo $prod['url_image']; ?>" alt="<?php echo $prod['nom']; ?>">
                                <?php else: ?>
                                    ⚽
                                <?php endif; ?>
                            </div>

                            <div class="item-info">
                                <h3><?php echo $prod['nom']; ?></h3>
                                <?php if ($prod['tailles']): ?>
                                    <p>Tailles: <?php echo $prod['tailles']; ?></p>
                                <?php endif; ?>
                                <?php if ($prod['couleurs']): ?>
                                    <p>Couleurs: <?php echo $prod['couleurs']; ?></p>
                                <?php endif; ?>
                                <div class="item-price">
                                    <?php echo number_format($prod['prix'], 2); ?> MAD
                                </div>
                            </div>

                            <div class="item-actions">
                                <form method="POST" class="quantity-form">
                                    <input type="hidden" name="id_produit" value="<?php echo $prod['id_produit']; ?>">
                                    <input type="number" name="quantite" value="<?php echo $prod['qte_panier']; ?>" min="0">
                                    <button type="submit" name="update_qte" class="btn-update">Mettre à jour</button>
                                </form>
                                <a href="?remove=<?php echo $prod['id_produit']; ?>" class="btn-remove" onclick="return confirm('Retirer ce produit ?')">Supprimer</a>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>

                <div class="summary">
                    <h2>Résumé</h2>
                    <div class="summary-line">
                        <span>Sous-total</span>
                        <span><?php echo number_format($total, 2); ?> MAD</span>
                    </div>
                    <div class="summary-line">
                        <span>Livraison</span>
                        <span>Gratuite</span>
                    </div>
                    <div class="summary-total">
                        <span>Total</span>
                        <span><?php echo number_format($total, 2); ?> MAD</span>
                    </div>
                    <a href="paiment.php" style="text-decoration: none;">
                        <button class="btn-checkout">Passer la commande</button>
                    </a>
                </div>
            </div>
        <?php else: ?>
            <div class="cart-items">
                <div class="empty-cart">
                    <h2>Votre panier est vide</h2>
                    <p>Découvrez nos produits et ajoutez-les à votre panier</p>
                    <a href="produits.php">Voir les produits</a>
                </div>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>