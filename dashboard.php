<?php
session_start();


if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login-admin.php');
    exit();
}

require_once 'config.php';
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            padding: 20px;
            color: #e2e8f0;
        }

 

        .header {
            background: #1e293b;
            padding: 25px 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            color: #3b82f6;
            font-size: 28px;
        }

        .logout-btn {
            background: #ef4444;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 12px;
            text-decoration: none;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .logout-btn:hover {
            background: #b91c1c;
        }

        .main {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }

        .card {
            background: linear-gradient(145deg, #1f2937, #111827);
            padding: 35px 25px;
            border-radius: 20px;
            text-align: center;
            transition: all 0.4s ease;
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
            color: #e2e8f0;
        }

        .card:hover {
            transform: translateY(-10px) scale(1.02);
            box-shadow: 0 15px 30px rgba(0,0,0,0.4);
        }
        .card.add { border-top: 5px solid #10b981; }
        .card.edit { border-top: 5px solid #f59e0b; }
        .card.delete { border-top: 5px solid #ef4444; }

        .card h2 {
            color: #3b82f6;
            font-size: 24px;
            margin-bottom: 15px;
        }

        .card p {
            color: #cbd5e1;
            margin-bottom: 25px;
            line-height: 1.6;
        }

        .card-btn {
            display: inline-block;
            padding: 12px 30px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }

        .btn-add {
            background: #10b981;
            color: white;
        }

        .btn-add:hover {
            background: #059669;
        }

        .btn-edit {
            background: #f59e0b;
            color: white;
        }

        .btn-edit:hover {
            background: #d97706;
        }

        .btn-delete {
            background: #ef4444;
            color: white;
        }

        .btn-delete:hover {
            background: #b91c1c;
        }

        .footer {
            background: #1e293b;
            padding: 25px;
            border-radius: 20px;
            text-align: center;
            margin-top: 40px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }

        .footer a {
            display: inline-block;
            padding: 15px 40px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .footer a:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
        <div class="header">
            <h1>Dashboard Admin</h1>
            <a href="login-admin.php" class="logout-btn">Déconnexion</a>
        </div>

        <div class="main">
            <div class="card add">
                <h2>Ajouter Produit</h2>
                <a href="ajouter-produit.php" class="card-btn btn-add">Ajouter</a>
            </div>

            <div class="card edit">
                <h2>Modifier Produit</h2>
                <a href="modifier-produit.php" class="card-btn btn-edit">Modifier</a>
            </div>

            <div class="card delete">
                <h2>Supprimer Produit</h2>
                <a href="supprimer-produit.php" class="card-btn btn-delete">Supprimer</a>
            </div>
        </div>

        <div class="footer">
            <a href="produits.php">Voir tous les produits</a>
        </div>
</body>
</html>
