import { Searchbar, SearchbarProps } from 'react-native-paper';

export function AppSearchBar({value,onChangeText,...props}:SearchbarProps){return <Searchbar {...props} value={value} onChangeText={onChangeText} mode="bar" clearIcon={value?'close-circle':'close'} onClearIconPress={()=>onChangeText?.('')} style={[{borderRadius:12,minHeight:48},props.style]} inputStyle={[{minHeight:48},props.inputStyle]}/>}
