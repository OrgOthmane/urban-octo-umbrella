<?php
session_start();

if (!isset($_SESSION['admin_logged_in'])) {
    header('Location: login-admin.php');
    exit();
}

require_once 'config.php';

$message = '';

$produits = $pdo->query("SELECT * FROM Produits ORDER BY id_produit DESC")->fetchAll();

$categories = $pdo->query("SELECT * FROM Categories")->fetchAll();

$produit = null;

if (isset($_GET['id'])) {
    $id = $_GET['id'];
    $stmt = $pdo->prepare("SELECT * FROM Produits WHERE id_produit = ?");
    $stmt->execute([$id]);
    $produit = $stmt->fetch();
}

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $id = $_POST['id_produit'];
    $nom = $_POST['nom'];
    $description = $_POST['description'];
    $prix = $_POST['prix'];
    $quantite = $_POST['quantite'];
    $id_categorie = $_POST['id_categorie'];
    $tailles = $_POST['tailles']; 
    $couleurs = $_POST['couleurs']; 

    $stmt = $pdo->prepare("UPDATE Produits SET nom=?, description=?, prix=?, quantite=?, id_categorie=?, tailles=?, couleurs=? WHERE id_produit=?");
    $stmt->execute([$nom, $description, $prix, $quantite, $id_categorie, $tailles, $couleurs, $id]);
    
    $stmt = $pdo->prepare("DELETE FROM Produit_Image WHERE id_produit=?");
    $stmt->execute([$id]);
    
    if (isset($_POST['images'])) {
        foreach ($_POST['images'] as $url) {
            if (!empty($url)) {
                $stmt = $pdo->prepare("INSERT INTO Produit_Image (id_produit, url_image) VALUES (?,?)");
                $stmt->execute([$id, $url]);
            }
        }
    }
    
    $message = 'Produit modifié avec succès !';
    header("Location: modifier-produit.php?id=$id&ok=1");
    exit();
}

if (isset($_GET['ok'])) {
    $message = 'Produit modifié avec succès !';
}

$produit_images = array();
if ($produit) {
    $stmt = $pdo->prepare("SELECT url_image FROM Produit_Image WHERE id_produit = ?");
    $stmt->execute([$produit['id_produit']]);
    $produit_images = $stmt->fetchAll(PDO::FETCH_COLUMN);
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Modifier Produit</title>
    <style>
        body {
            font-family: Arial;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: #f59e0b;
            text-align: center;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 5px;
        }
        .header h1 {
            margin: 0 0 10px 0;
        }
        .header a {
            color: #0066cc;
            text-decoration: none;
        }
        .message {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 5px;
            text-align: center;
        }
        .content {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 20px;
        }
        .list {
            background: #f59e0b;
            padding: 20px;
            border-radius: 5px;
            max-height: 600px;
            overflow-y: auto;
        }
        .list h2 {
            margin-top: 0;
        }
        .item {
            padding: 10px;
            margin-bottom: 10px;
            background-color: wheat;
            border: 1px solid #ddd;
            border-radius: 3px;
            display: block;
            color: black;
            text-decoration: none;
        }
        .item:hover {
            background: #f0f0f0;
        }
        .item.active {
            background: #0066cc;
            color: white;
        }
        .form {
            background: white;
            color:orangered;
            padding: 30px;
            border-radius: 5px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 14px;
        }
        .form-group textarea {
            height: 80px;
        }
        .row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .info-box {
            background: #f9f9f9;
            padding: 10px;
            border-radius: 3px;
            font-size: 13px;
            color: #666;
            margin-top: 5px;
        }
        .image-group {
            margin-bottom: 10px;
            display: flex;
            gap: 10px;
        }
        .image-group input {
            flex: 1;
        }
        .btn {
            padding: 8px 15px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .btn-remove {
            background: #dc3545;
            color: white;
        }
        .btn-add {
            background: #007bff;
            color: white;
            margin-top: 10px;
        }
        .btn-submit {
            width: 100%;
            padding: 12px;
            background: #28a745;
            color: white;
            font-size: 16px;
            margin-top: 20px;
        }
        .no-select {
            text-align: center;
            padding: 50px;
            color: #999;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Modifier Produit</h1>
            <a href="dashboard.php">← Retour</a>
        </div>

        <?php if ($message): ?>
            <div class="message"><?php echo $message; ?></div>
        <?php endif; ?>

        <div class="content">
            <div class="list">
                <h2>Produits</h2>
                <?php foreach ($produits as $p): ?>
                    <a href="?id=<?php echo $p['id_produit']; ?>" 
                       class="item <?php echo (isset($_GET['id']) && $_GET['id'] == $p['id_produit']) ? 'active' : ''; ?>">
                        <strong><?php echo $p['nom']; ?></strong><br>
                        <small style="color:red"><?php echo $p['prix']; ?> MAD</small>
                    </a>
                <?php endforeach; ?>
            </div>

            <div class="form">
                <?php if ($produit): ?>
                    <form method="POST">
                        <input type="hidden" name="id_produit" value="<?php echo $produit['id_produit']; ?>">

                        <div class="form-group">
                            <label>Catégorie </label>
                            <select name="id_categorie" required>
                                <?php foreach ($categories as $cat): ?>
                                    <option value="<?php echo $cat['id_categorie']; ?>" 
                                            <?php echo ($produit['id_categorie'] == $cat['id_categorie']) ? 'selected' : ''; ?>>
                                        <?php echo $cat['nom']; ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Nom </label>
                            <input type="text" name="nom" value="<?php echo $produit['nom']; ?>" required>
                        </div>

                        <div class="form-group">
                            <label>Description</label>
                            <textarea name="description"><?php echo $produit['description']; ?></textarea>
                        </div>

                        <div class="row">
                            <div class="form-group">
                                <label>Prix MAD</label>
                                <input type="number" step="0.01" name="prix" value="<?php echo $produit['prix']; ?>" required>
                            </div>
                            <div class="form-group">
                                <label>Quantité</label>
                                <input type="number" name="quantite" value="<?php echo $produit['quantite']; ?>">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Tailles</label>
                            <input type="text" name="tailles" value="<?php echo $produit['tailles']; ?>" >
                        </div>

                        <div class="form-group">
                            <label>Couleurs</label>
                            <input type="text" name="couleurs" value="<?php echo $produit['couleurs']; ?>" >
                        </div>

                        <div class="form-group">
                            <label>Images</label>
                            <div id="images">
                                <?php if (!empty($produit_images)): ?>
                                    <?php foreach ($produit_images as $img): ?>
                                        <div class="image-group">
                                            <input type="text" name="images[]" value="<?php echo $img; ?>">
                                         
                                        </div>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <div class="image-group">
                                        <input type="text" name="images[]" placeholder="URL image">
                                    </div>
                                <?php endif; ?>
                            </div>
                       
                        </div>

                        <button type="submit" class="btn btn-submit">Enregistrer les modifications</button>
                    </form>
                <?php else: ?>
                    <div class="no-select">
                        <h3>Sélectionnez un produit</h3>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>


</body>
</html>