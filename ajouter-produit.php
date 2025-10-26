<?php
session_start();
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login-admin.php');
    exit();
}

require_once 'config.php';

$message = '';

$categories = $pdo->query("SELECT * FROM Categories ORDER BY nom")->fetchAll(PDO::FETCH_ASSOC);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_produit'])) {
    $id_categorie = $_POST['id_categorie'];
    $nom = trim($_POST['nom']);
    $prix = $_POST['prix'];
    $description = trim($_POST['description']);
    $quantite = $_POST['quantite'];
    $tailles = trim($_POST['tailles']); 
    $couleurs = trim($_POST['couleurs']); 
    $images = trim($_POST['images']); 

    if (!empty($nom) && !empty($prix) && !empty($id_categorie)) {
        $stmt = $pdo->prepare("INSERT INTO Produits (id_categorie, nom, description, tailles, couleurs, prix, quantite) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id_categorie, $nom, $description, $tailles, $couleurs, $prix, $quantite]);
        
        $id_produit = $pdo->lastInsertId();
        
        if (!empty($images)) {
            $urls = preg_split('/[,;]/', $images);
            $stmt_image = $pdo->prepare("INSERT INTO Produit_Image (id_produit, url_image) VALUES (?, ?)");
            foreach ($urls as $url) {
                $url = trim($url);
                if (!empty($url)) {
                    $stmt_image->execute([$id_produit, $url]);
                }
            }
        }
        header('Location: ajouter-produit.php?success=1');
        exit();
    } else {
        $message = 'Veuillez remplir tous les champs obligatoires';
    }
}
if (isset($_GET['success'])) {
    $message = 'Produit ajouté avec succès !';
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ajouter Produit</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .header h1 {
            color: #333;
        }
        .back-link {
            display: inline-block;
            margin-top: 10px;
            color: #0066cc;
            text-decoration: none;
        }
        .form-container {
            background: white;
            padding: 30px;
            border-radius: 10px;
        }
        .message {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
        }
        .message.success {
            background: #d4edda;
            color: #155724;
        }
        .message.error {
            background: #f8d7da;
            color: #721c24;
        }
        .form-group {
            margin-bottom: 20px;
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
            border-radius: 5px;
            font-size: 14px;
        }
        .form-group textarea {
            min-height: 100px;
            resize: vertical;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .image-group {
            margin-bottom: 10px;
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-add {
            background: #0066cc;
            color: white;
        }
        .btn-remove {
            background: #dc2626;
            color: white;
        }
        .btn-submit {
            width: 100%;
            padding: 15px;
            background: #28a745;
            color: white;
            font-size: 16px;
            font-weight: bold;
            margin-top: 20px;
        }
        .btn-submit:hover {
            background: #218838;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1> Ajouter un Produit</h1>
            <a href="dashboard.php" class="back-link">← Retour au dashboard</a>
        </div>

        <div class="form-container">
            <?php if (!empty($message)): ?>
                <div class="message <?php echo $message_type; ?>">
                    <?php echo $message; ?>
                </div>
            <?php endif; ?>

            <form method="POST">
                <div class="form-group">
                    <label>Categorie</label>
                    <select name="id_categorie" required>
                        <option value="">-- Sélectionner --</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?php echo $cat['id_categorie']; ?>">
                                <?php echo $cat['nom']; ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label>Nom du produit</label>
                    <input type="text" name="nom" required >
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description"></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Prix MAD</label>
                        <input type="number" name="prix" required>
                    </div>

                    <div class="form-group">
                        <label>Quantite totale</label>
                        <input type="number" name="quantite"required>
                    </div>
                </div>

                <div class="form-group">
                    <label>Tailles disponibles</label>
                    <input type="text" name="tailles">
                </div>

                <div class="form-group">
                    <label>Couleurs disponibles</label>
                    <input type="text" name="couleurs">
                </div>

                <div class="form-group">
                    <label>Images du produit</label>
                    <input type="text" name="images" placeholder="URL d'image">
                </div>

                <button type="submit" name="add_produit" class="btn btn-submit">✓ Ajouter le produit</button>
            </form>
        </div>
    </div>
</body>
</html>