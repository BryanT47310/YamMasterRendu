import React, { useEffect, useState, useContext } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SocketContext } from '../contexts/socket.context';
import Board from "../components/board/board.component";
import GameOver from "../components/game/GameOver";

export default function OnlineGameController() {

    const socket = useContext(SocketContext);

    const [inQueue, setInQueue] = useState(false);
    const [inGame, setInGame] = useState(false);
    const [idOpponent, setIdOpponent] = useState(null);
    const [gameOver, setGameOver] = useState(false);
    const [vainqueur, setVainqueur] = useState(null);
    const [player1Score, setPlayer1Score] = useState(0);
    const [player2Score, setPlayer2Score] = useState(0);

    useEffect(() => {

        socket.emit("queue.join");
        setInQueue(false);
        setInGame(false);

        socket.on('queue.added', (data) => {
            setInQueue(data['inQueue']);
            setInGame(data['inGame']);
        });

        socket.on('game.start', (data) => {
            setInQueue(data['inQueue']);
            setInGame(data['inGame']);
            setIdOpponent(data['idOpponent']);
        });

        socket.on('botGame.end', (data) => {
            setGameOver(true);
            setVainqueur(data.vainqueur);
            setPlayer1Score(data.player1Score);
            setPlayer2Score(data.player2Score);
        });

    }, []);

    return (

        <View style={styles.container}>

            {!inQueue && !inGame && (
                <>
                    <Text style={styles.paragraph}>
                        Waiting for server datas...
                    </Text>
                </>
            )}

            {inQueue && (
                <>
                    <Text style={styles.paragraph}>
                        Waiting for another player...
                    </Text>
                </>
            )}

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