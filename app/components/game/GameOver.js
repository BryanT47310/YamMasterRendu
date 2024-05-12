import React from "react";
import { View, Text, Button } from 'react-native';

const GameOver = ({vainqueur, player1Score, player2Score}) => {

    return (

        <View>
            <Text>Fin de la partie</Text>
            <Text>Vainqueur : {vainqueur}</Text>
            <Text>Player 1 score : {player1Score}</Text>
            <Text>Player 2 score : {player2Score}</Text>
            <Button
                title="Retourner au menu principal"
                onPress={() => navigation.navigate('HomeScreen')}
            />
        </View>
    );
};

export default GameOver;
