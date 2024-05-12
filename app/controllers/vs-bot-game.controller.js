import React, { useEffect, useState, useContext } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SocketContext } from '../contexts/socket.context';
import Board from "../components/board/board.component";
import GameOver from "../components/game/GameOver";

export default function VSBotGameController() {

    const socket = useContext(SocketContext);

    const [inGame, setInGame] = useState(false);
    const [idOpponent, setIdOpponent] = useState(null);
    const [gameOver, setGameOver] = useState(false);
    const [vainqueur, setVainqueur] = useState(null);
    const [player1Score, setPlayer1Score] = useState(0);
    const [player2Score, setPlayer2Score] = useState(0);

    useEffect(() => {

        // Émettre l'événement pour rejoindre la partie contre le bot
        socket.emit("botGame.join");

        // Écouter l'événement de démarrage de la partie contre le bot
        socket.on('botGame.start', (data) => {
            setInGame(true);            // Mettre à jour l'état du jeu
            setIdOpponent(data.idBot);  // Mettre à jour l'ID de l'opposant (bot)
        });

        socket.on('botGame.end', (data) => {
            setGameOver(true);
            setVainqueur(data.vainqueur);
            setPlayer1Score(data.player1Score);
            setPlayer2Score(data.player2Score);
        });

        return () => {
            // Supprimer les écouteurs lors du démontage du composant pour éviter les fuites de mémoire
            socket.off('botGame.start');
        };

    }, [socket]);  // Ajout de socket en dépendance pour éviter les effets de bord

    return (

        <View style={styles.container}>

            {inGame && !gameOver && (
                <>
                    <Board />
                </>
            )}
            {gameOver && (
                <>
                    <GameOver vainqueur={vainqueur} player1Score={player1Score} player2Score={player2Score} />
                </>
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        width: '100%',
        height: '100%',
    },
    paragraph: {
        fontSize: 16,
    }
});
