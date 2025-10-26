<?php
session_start();
require_once 'config.php';

if (!isset($_SESSION['client_logged_in']) || !isset($_GET['commande'])) {
    header('Location: produits.php');
    exit();
}

$id_commande = $_GET['commande'];
$id_client = $_SESSION['client_id'];

$stmt = $pdo->prepare("SELECT * FROM Commande WHERE id_commande = ? AND id_client = ?");
$stmt->execute([$id_commande, $id_client]);
$commande = $stmt->fetch();

if (!$commande) {
    header('Location: produits.php');
    exit();
}

$stmt = $pdo->prepare("
    SELECT p.*, cp.quantite
    FROM Commande_Produit cp
    JOIN Produits p ON cp.id_produit = p.id_produit
    WHERE cp.id_commande = ?
");
$stmt->execute([$id_commande]);
$produits = $stmt->fetchAll();

$stmt = $pdo->prepare("SELECT * FROM Client WHERE id_client = ?");
$stmt->execute([$id_client]);
$client = $stmt->fetch();

$stmt = $pdo->prepare("SELECT * FROM Paiement WHERE id_commande = ?");
$stmt->execute([$id_commande]);
$paiement = $stmt->fetch();
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmation - ProFoot</title>
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
        }

        .logo {
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }

        .container {
            max-width: 800px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .success-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
        }

        .success-icon {
            font-size: 80px;
            color: #28a745;
            margin-bottom: 20px;
        }

        .success-box h1 {
            color: #28a745;
            margin-bottom: 15px;
        }

        .success-box p {
            color: #666;
            font-size: 16px;
            line-height: 1.6;
        }

        .order-number {
            background: #f0fff4;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-size: 18px;
            font-weight: bold;
            color: #28a745;
        }

        .details-box {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .info-item {
            padding: 15px;
            background: #f9f9f9;
            border-radius: 5px;
        }

        .info-item label {
            display: block;
            font-weight: bold;
            color: #666;
            margin-bottom: 5px;
            font-size: 13px;
        }

        .info-item p {
            color: #333;
            font-size: 15px;
        }

        .products-list {
            margin-top: 20px;
        }

        .product-item {
            display: flex;
            justify-content: space-between;
            padding: 15px;
            border-bottom: 1px solid #ddd;
            align-items: center;
        }

        .product-name {
            flex: 1;
            color: #333;
        }

        .product-quantity {
            color: #666;
            margin: 0 20px;
        }

        .product-price {
            font-weight: bold;
            color: #28a745;
        }

        .total-line {
            display: flex;
            justify-content: space-around;
            margin-bottom: 10px;
            font-size: 18px;
        }

        .total-line.final {
            font-size: 24px;
            font-weight: bold;
            color: #28a745;
            padding-top: 15px;
            border-top: 2px solid #28a745;
        }
        .btn {
            padding: 15px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            text-decoration: none;
            display: block;
            text-align: center;
        }

        .btn-primary {
            background: #0066cc;
            color: white;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-container">
            <div class="logo">⚽ ProFoot</div>
        </div>
    </header>

    <div class="container">
        <div class="success-box">
            <div class="success-icon">✓</div>
            <h1>Commande confirmée !</h1>
            <p>Merci pour votre commande. Vous recevrez un email de confirmation à l'adresse <strong><?php echo $client['email']; ?></strong></p>
            
            <div class="order-number">
                Numéro de commande : #<?php echo str_pad($commande['id_commande'], 6, '0', STR_PAD_LEFT); ?>
            </div>
        </div>

        <div class="details-box">
            <h2> Details de la commande</h2>

            <div class="info-grid">
                <div class="info-item">
                    <label>Client</label>
                    <p><?php echo $client['nom'] . ' ' . $client['prenom']; ?></p>
                </div>

                <div class="info-item">
                    <label>Email</label>
                    <p><?php echo $client['email']; ?></p>
                </div>

                <div class="info-item">
                    <label>Téléphone</label>
                    <p><?php echo $client['telephone']; ?></p>
                </div>

                <div class="info-item">
                    <label>Mode de paiement</label>
                    <p><?php echo $paiement['mode_paiement']; ?></p>
                </div>
            </div>

            <div class="info-item">
                <label>Adresse de livraison</label>
                <p><?php echo $client['adresse']; ?></p>
            </div>

            <div class="products-list">
                <h3 style="margin: 20px 0 15px 0; color: #333;">Produits commandés</h3>
                <?php foreach ($produits as $prod): ?>
                    <div class="product-item">
                        <div class="product-name">
                            <b><?php echo $prod['nom']; ?></b>
                        </div>
                        <div class="product-quantity">x<?php echo $prod['quantite']; ?></div>
                        <div class="product-price"><?php echo number_format($prod['prix'] * $prod['quantite'], 2); ?> MAD</div>
                    </div>
                <?php endforeach; ?>
            </div>
                <div class="total-line final">
                    <span>Total paye</span>
                    <span><?php echo number_format($commande['total'], 2); ?> MAD</span>
                </div>
        </div>
        <div style="margin-top: 10px;">
            <a href="produits.php" class="btn btn-primary">Continuer mes achats</a>
        </div>
    </div>
</body>
</html>