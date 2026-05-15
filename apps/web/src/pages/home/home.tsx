import styles from './home.module.css'
import { useNavigate } from 'react-router-dom'
import { useCallback, useState } from 'react'

interface optionType{
  value: string
  label: string
}

const options: optionType[] = [
  { value: '1', label: '瑞幸项目组（成员视角）' },
  { value: '2', label: '个人知识库' },
  { value: '3', label: '瑞兴项目组（管理员视角）' }
]

const Home = () => {

  const centerText = '准备好大干一场了吗'
  const [option, setOption] = useState<string>('2')
  const [inputValue,setInputValue] = useState('')
  const usenavigate = useNavigate()
  const isEmpty = inputValue.trim() === ''
  const placeholder = '描述你的创意，例如：给瑞幸咖啡做一份夏日户外海报，极简风格...'
  //const { userName } = useUser()  //获取用户名

  const goToWorkspace = useCallback(() => {

    if(isEmpty) {
      //alert(`${userName}同学，得输入点创意才能开始哦`)  //如果有用户名，使用用户名进行提示
      alert('王同学，得输入点创意才能开始哦')
      return
    }

      usenavigate('/workspace',{state:{option,inputValue:inputValue.trim()}})
  }, [option,inputValue,isEmpty,usenavigate])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if(e.key === 'Enter') {
      e.preventDefault()
      goToWorkspace()
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <div className={styles.textBox}>
          <p className={styles.text}>{centerText}</p>
        </div>
        <div className={styles.selectBox}>
          <select className={styles.select} id="" value={option} onChange={(e:React.ChangeEvent<HTMLSelectElement>) => setOption(e.target.value)}>
            {options.map((optobj) => (
              <option value={optobj.value}>
                {optobj.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.inputBox}>
          <input
            type="text"
            className={styles.input} 
            placeholder={placeholder}
            value={inputValue}
            onChange={(e:React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.button} onClick={goToWorkspace} aria-label="跳转工作区">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}

export default Home
