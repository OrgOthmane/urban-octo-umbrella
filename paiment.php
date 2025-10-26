<?php
session_start();
require_once 'config.php';

if (!isset($_SESSION['client_logged_in'])) {
    header('Location: login-client.php');
    exit();
}

$id_client = $_SESSION['client_id'];
$message = '';
$message_type = '';

$stmt = $pdo->prepare("SELECT id_panier FROM Panier WHERE id_client = ? ORDER BY date_creation DESC LIMIT 1");
$stmt->execute([$id_client]);
$panier = $stmt->fetch();

if (!$panier) {
    header('Location: panier.php');
    exit();
}

$id_panier = $panier['id_panier'];

$stmt = $pdo->prepare("
    SELECT p.*, pp.quantite as qte_panier
    FROM Panier_Produit pp
    JOIN Produits p ON pp.id_produit = p.id_produit
    WHERE pp.id_panier = ?
");
$stmt->execute([$id_panier]);
$produits_panier = $stmt->fetchAll();

if (count($produits_panier) == 0) {
    header('Location: panier.php');
    exit();
}

$total = 0;
foreach ($produits_panier as $prod) {
    $total += $prod['prix'] * $prod['qte_panier'];
}
$stmt = $pdo->prepare("SELECT * FROM Client WHERE id_client = ?");
$stmt->execute([$id_client]);
$client = $stmt->fetch();

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $mode_paiement = $_POST['mode_paiement'];
    $adresse_livraison = $_POST['adresse'];

    $stmt = $pdo->prepare("INSERT INTO Commande (id_client, total, statut, date_commande) VALUES (?, ?, 'en attente', NOW())");
    $stmt->execute([$id_client, $total]);
    $id_commande = $pdo->lastInsertId();
    foreach ($produits_panier as $prod) {
        $stmt = $pdo->prepare("INSERT INTO Commande_Produit (id_commande, id_produit, quantite) VALUES (?, ?, ?)");
        $stmt->execute([$id_commande, $prod['id_produit'], $prod['qte_panier']]);
        $stmt = $pdo->prepare("UPDATE Produits SET quantite = quantite - ? WHERE id_produit = ?");
        $stmt->execute([$prod['qte_panier'], $prod['id_produit']]);
    }
    $stmt = $pdo->prepare("INSERT INTO Paiement (id_commande, montant, mode_paiement, date_paiement) VALUES (?, ?, ?, CURDATE())");
    $stmt->execute([$id_commande, $total, $mode_paiement]);
    
    $stmt = $pdo->prepare("DELETE FROM Panier_Produit WHERE id_panier = ?");
    $stmt->execute([$id_panier]);
    
    header("Location: confirmation.php?commande=$id_commande");
    exit();
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Paiement - ProFoot</title>
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
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }

        .container {
            max-width: 900px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .etaps {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            background: white;
            padding: 20px;
            border-radius: 5px;
        }

        .etap {
            flex: 1;
            text-align: center;
            padding: 15px;
            position: relative;
        }

        .etap.active {
            color: #28a745;
            font-weight: bold;
        }

        .etap.completed {
            color: #28a745;
        }

        .etap::after {
            content: '→';
            position: absolute;
            right: -20px;
            top: 50%;
            transform: translateY(-50%);
        }

        .etap:last-child::after {
            display: none;
        }

        .content {
            display: grid;
            grid-template-columns: 1fr 350px;
            gap: 20px;
        }

        .payment-form {
            background: white;
            padding: 30px;
            border-radius: 5px;
        }

        .form-section {
            margin-bottom: 30px;
        }

        .form-section h2 {
            margin-bottom: 15px;
            color: #333;
            font-size: 20px;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #333;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 14px;
        }

        .form-group textarea {
            min-height: 80px;
            resize: vertical;
        }

        .payment-methods {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .payment-method {
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 5px;
            cursor: pointer;
            text-align: center;
            transition: all 0.3s;
        }

        .payment-method:hover {
            border-color: #28a745;
        }

        .payment-method input[type="radio"] {
            margin-right: 8px;
        }

        .payment-method.selected {
            border-color: #28a745;
            background: #f0fff4;
        }

        .order-summary {
            background: white;
            padding: 20px;
            border-radius: 5px;
            height: fit-content;
        }

        .order-summary h2 {
            margin-bottom: 20px;
            color: #333;
        }

        .summary-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #ddd;
        }

        .summary-item:last-child {
            border-bottom: none;
        }

        .summary-total {
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            font-weight: bold;
            color: #333;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #333;
        }

        .btn-submit {
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

        .btn-submit:hover {
            background: #218838;
        }

        .btn-back {
            width: 100%;
            padding: 12px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 5px;
            text-decoration: none;
            display: block;
            text-align: center;
            margin-top: 10px;
        }
        @media (max-width: 968px) {
            .content {
                grid-template-columns: 1fr;
            }

            .payment-methods {
                grid-template-columns: 1fr;
            }

            .etaps {
                font-size: 12px;
            }
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
        <div class="etaps">
            <div class="etap completed">1. Panier</div>
            <div class="etap active">2. Paiement</div>
            <div class="etap">3. Confirmation</div>
        </div>

        <div class="content">
            <div class="payment-form">
                <form method="POST">
    
                    <div class="form-section">
                        <h2>Informations de livraison</h2>
                        
                        <div class="form-group">
                            <label>Nom complet</label>
                            <input type="text" value="<?php echo $client['nom'] . ' ' . $client['prenom']; ?>" readonly>
                        </div>

                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" value="<?php echo $client['email']; ?>" readonly>
                        </div>

                        <div class="form-group">
                            <label>Téléphone</label>
                            <input type="tel" value="<?php echo $client['telephone']; ?>" readonly>
                        </div>

                        <div class="form-group">
                            <label>Adresse de livraison *</label>
                            <textarea name="adresse" required><?php echo $client['adresse']; ?></textarea>
                        </div>
                    </div>

                    <div class="form-section">
                        <h2>💳 Mode de paiement</h2>
                        
                        <div class="payment-methods">
                            <label class="payment-method">
                                <input type="radio" name="mode_paiement" value="carte" required>
                                <div>💳 Carte bancaire</div>
                            </label>

                            <label class="payment-method" >
                                <input type="radio" name="mode_paiement" value="paypal" required>
                                <div>💰 PayPal</div>
                            </label>

                            <label class="payment-method" >
                                <input type="radio" name="mode_paiement" value="espèces" required>
                                <div>💵 Espèces</div>
                            </label>

                            <label class="payment-method">
                                <input type="radio" name="mode_paiement" value="virement bancaire" required>
                                <div>🏦 Virement</div>
                            </label>
                        </div>
                    </div>

                    <button type="submit" class="btn-submit">Valider la commande</button>
                    <a href="panier.php" class="btn-back">← Retour au panier</a>
                </form>
            </div>
            <div class="order-summary">
                <h2>Récapitulatif</h2>
                
                <?php foreach ($produits_panier as $prod): ?>
                    <div class="summary-item">
                        <span><?php echo $prod['nom']; ?> x<?php echo $prod['qte_panier']; ?></span>
                        <span><?php echo number_format($prod['prix'] * $prod['qte_panier'], 2); ?> MAD</span>
                    </div>
                <?php endforeach; ?>

                <div class="summary-item">
                    <span>Livraison</span>
                    <span>Gratuite</span>
                </div>

                <div class="summary-total">
                    <span>Total a payer</span>
                    <span><?php echo number_format($total, 2); ?> MAD</span>
                </div>
            </div>
        </div>
    </div>
</body>
</html>