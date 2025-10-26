<?php
session_start();
unset($_SESSION['client_logged_in']);
unset($_SESSION['client_id']);
unset($_SESSION['client_nom']);
unset($_SESSION['client_prenom']);
header('Location: produits.php');
exit();
?>