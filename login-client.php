<?php
session_start();

if (isset($_SESSION['client_logged_in'])) {
    header('Location: produits.php');
    exit();
}

require_once 'config.php';

$error = '';
$success = '';
if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['login'])) {
    $email = trim($_POST['email']);
    $password = trim($_POST['password']);
    
    if (!empty($email) && !empty($password)) {
        $stmt = $pdo->prepare("SELECT * FROM Client WHERE email = ?");
        $stmt->execute([$email]);
        $client = $stmt->fetch();
        
        if ($client && $client['mot_de_passe'] === $password) {
            $_SESSION['client_logged_in'] = true;
            $_SESSION['client_id'] = $client['id_client'];
            $_SESSION['client_nom'] = $client['nom'];
            $_SESSION['client_prenom'] = $client['prenom'];
            
            header('Location: produits.php');
            exit();
        } else {
            $error = 'Email ou mot de passe incorrect';
        }
    } else {
        $error = 'Veuillez remplir tous les champs';
    }
}

if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['register'])) {
    $nom = trim($_POST['nom']);
    $prenom = trim($_POST['prenom']);
    $email = trim($_POST['email']);
    $telephone = trim($_POST['telephone']);
    $adresse = trim($_POST['adresse']);
    $password = trim($_POST['password']);
    $confirm_password = trim($_POST['confirm_password']);
    
    if (empty($nom) || empty($prenom) || empty($email) || empty($password)) {
        $error = 'Veuillez remplir tous les champs obligatoires';
    } elseif ($password !== $confirm_password) {
        $error = 'Les mots de passe ne correspondent pas';
    } else {
        $stmt = $pdo->prepare("SELECT id_client FROM Client WHERE email = ?");
        $stmt->execute([$email]);
        
        if ($stmt->fetch()) {
            $error = 'Cet email est deja utilise';
        } else {
            $stmt = $pdo->prepare("INSERT INTO Client (nom, prenom, email, telephone, adresse, mot_de_passe) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$nom, $prenom, $email, $telephone, $adresse, $password]);
            
            $success = 'Compte cree avec succes ! Vous pouvez maintenant vous connecter.';
        }
    }
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connexion - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            width: 100%;
        }

        .logo {
            text-align: center;
            margin-bottom: 30px;
            color: white;
            font-size: 32px;
            font-weight: bold;
        }

        .forms-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }

        .form-box h2 {
            margin-bottom: 20px;
            color: #333;
        }

        .message {
            padding: 12px;
            border-radius: 5px;
            margin-bottom: 15px;
            text-align: center;
        }

        .error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: bold;
        }

        .form-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }

        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }

        .btn {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 10px;
        }

        .btn-login {
            background: #667eea;
            color: white;
        }

        .btn-login:hover {
            background: #5568d3;
        }

        .btn-register {
            background: #28a745;
            color: white;
        }

        .btn-register:hover {
            background: #218838;
        }

        .divider {
            width: 2px;
            background: #e0e0e0;
        }

        .back-link {
            text-align: center;
            margin-top: 20px;
        }

        .back-link a {
            color: white;
            text-decoration: none;
            font-size: 14px;
        }

    </style>
</head>
<body>
    <div class="container">
        <div class="logo">⚽ ProFoot</div>

        <div class="forms-container">
            <div class="form-box">
                <h2>Se connecter</h2>

                <?php if ($error && isset($_POST['login'])): ?>
                    <div class="message error"><?php echo $error; ?></div>
                <?php endif; ?>

                <?php if ($success): ?>
                    <div class="message success"><?php echo $success; ?></div>
                <?php endif; ?>

                <form method="POST">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email" required placeholder="votre@email.com">
                    </div>

                    <div class="form-group">
                        <label>Mot de passe</label>
                        <input type="password" name="password" required placeholder="••••••••">
                    </div>

                    <button type="submit" name="login" class="btn btn-login">Connexion</button>
                </form>
            </div>
            <div class="form-box">
                <h2>Créer un compte</h2>

                <?php if ($error && isset($_POST['register'])): ?>
                    <div class="message error"><?php echo $error; ?></div>
                <?php endif; ?>

                <form method="POST">
                    <div class="form-group">
                        <label>Nom </label>
                        <input type="text" name="nom" required>
                    </div>

                    <div class="form-group">
                        <label>Prenom </label>
                        <input type="text" name="prenom" required>
                    </div>

                    <div class="form-group">
                        <label>Email </label>
                        <input type="email" name="email" required>
                    </div>

                    <div class="form-group">
                        <label>Téléphone</label>
                        <input type="tel" name="telephone">
                    </div>

                    <div class="form-group">
                        <label>Adresse</label>
                        <input type="text" name="adresse">
                    </div>

                    <div class="form-group">
                        <label>Mot de passe </label>
                        <input type="password" name="password" required>
                    </div>

                    <div class="form-group">
                        <label>Confirmer mot de passe </label>
                        <input type="password" name="confirm_password" required>
                    </div>

                    <button type="submit" name="register" class="btn btn-register">S'inscrire</button>
                </form>
            </div>
        </div>
        <div class="back-link">
            <a href="produits.php">← Retour aux produits</a>
        </div>
    </div>
</body>
</html>